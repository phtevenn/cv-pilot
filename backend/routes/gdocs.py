import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import markdown as md_lib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from database import GDocCategory, GDocResume, get_engine
from deps import get_current_user
from gdocs_client import create_google_doc_from_html, has_drive_access
from llm_client import get_client
from anthropic import AsyncAnthropic

router = APIRouter()

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Auth status
# ---------------------------------------------------------------------------

@router.get("/auth-status")
async def gdocs_auth_status(user: dict = Depends(get_current_user)) -> dict:
    return {"has_drive_access": has_drive_access(user["sub"])}


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)) -> dict:
    with Session(get_engine()) as session:
        stmt = select(GDocCategory).where(GDocCategory.user_id == user["sub"])
        cats = session.exec(stmt).all()
        return {"categories": [{"id": c.id, "name": c.name, "color": c.color} for c in cats]}


@router.post("/categories", status_code=201)
async def create_category(request: Request, user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    color = body.get("color", "blue")
    cat = GDocCategory(id=str(uuid.uuid4()), user_id=user["sub"], name=name, color=color)
    with Session(get_engine()) as session:
        session.add(cat)
        session.commit()
        session.refresh(cat)
        return {"id": cat.id, "name": cat.name, "color": cat.color}


@router.patch("/categories/{cat_id}")
async def update_category(cat_id: str, request: Request, user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    with Session(get_engine()) as session:
        cat = session.get(GDocCategory, cat_id)
        if cat is None or cat.user_id != user["sub"]:
            raise HTTPException(status_code=404, detail="Category not found")
        if "name" in body:
            cat.name = body["name"].strip() or cat.name
        if "color" in body:
            cat.color = body["color"]
        session.add(cat)
        session.commit()
        session.refresh(cat)
        return {"id": cat.id, "name": cat.name, "color": cat.color}


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)) -> None:
    with Session(get_engine()) as session:
        cat = session.get(GDocCategory, cat_id)
        if cat is None or cat.user_id != user["sub"]:
            raise HTTPException(status_code=404, detail="Category not found")
        # Unset category_id on resumes in this category
        stmt = select(GDocResume).where(GDocResume.user_id == user["sub"]).where(GDocResume.category_id == cat_id)
        for r in session.exec(stmt).all():
            r.category_id = None
            session.add(r)
        session.delete(cat)
        session.commit()


# ---------------------------------------------------------------------------
# GDoc Resumes
# ---------------------------------------------------------------------------

def _resume_to_dict(r: GDocResume) -> dict:
    return {
        "id": r.id,
        "google_doc_id": r.google_doc_id,
        "title": r.title,
        "category_id": r.category_id,
        "google_doc_url": f"https://docs.google.com/document/d/{r.google_doc_id}/edit",
        "preview_url": f"https://docs.google.com/document/d/{r.google_doc_id}/preview",
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


@router.get("/resumes")
async def list_resumes(
    user: dict = Depends(get_current_user),
    category_id: Optional[str] = None,
) -> dict:
    with Session(get_engine()) as session:
        stmt = select(GDocResume).where(GDocResume.user_id == user["sub"])
        if category_id:
            stmt = stmt.where(GDocResume.category_id == category_id)
        resumes = session.exec(stmt.order_by(GDocResume.created_at.desc())).all()
        return {"resumes": [_resume_to_dict(r) for r in resumes]}


# System prompt reused from llm.py logic
_SYSTEM_PROMPT_TEMPLATE = """\
You are a professional resume optimizer. Given a resume in Markdown format and a job description, \
rewrite the resume to better target the role.

CRITICAL RULES — follow every rule exactly:
1. OUTPUT FORMAT: Return ONLY the revised resume in Markdown. No commentary, preamble, or postamble.
2. PRESERVE ALL SECTIONS: The resume contains named sections separated by bold all-caps headings \
(e.g. **SUMMARY**, **EXPERIENCE**, **EDUCATION**, **SKILLS**). You MUST output every section that \
exists in the original, in the same order. Do not merge, remove, or rename any section.
3. SECTION HEADING FORMAT: Every section heading MUST appear on its own line as **SECTION NAME** — \
double asterisks, ALL UPPERCASE, nothing else on that line.
4. HEADER BLOCK: The header (top of resume) contains ONLY name and contact details \
(email, phone, LinkedIn, location, etc.). Do NOT place paragraph text or a summary in the header block.
5. SUMMARY / PROFILE: If the original has a **SUMMARY** or **PROFILE** section, it MUST remain as \
its own separate section with its own **SUMMARY** heading — never fold it into the header block. \
Write the summary as 1–2 concise sentences only. No bullet points, no long paragraphs.
6. CONTENT: Strengthen bullet points with impact-driven language and keywords from the job description. \
Do not invent experience or credentials not present in the original.
7. LENGTH: The revised resume MUST fit within {page_limit} page{page_limit_plural}. \
Trim less-relevant bullet points or shorten descriptions as needed — do NOT remove entire sections.\
"""


@router.post("/resumes/generate")
async def generate_resume(
    request: Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """SSE stream: Claude generates resume → creates Google Doc → returns metadata."""
    body = await request.json()
    title: str = body.get("title", "Tailored Resume").strip() or "Tailored Resume"
    job_description: str = body.get("job_description", "")
    category_id: Optional[str] = body.get("category_id") or None
    page_limit: int = max(1, min(int(body.get("page_limit", 1)), 5))

    if not job_description.strip():
        raise HTTPException(status_code=422, detail="job_description is required")

    if not has_drive_access(user["sub"]):
        raise HTTPException(status_code=403, detail="Google Drive not connected")

    # Load user's current base resume content
    import storage
    base_resume = storage.load_resume(user["sub"])

    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        page_limit=page_limit,
        page_limit_plural="s" if page_limit > 1 else "",
    )
    user_message = f"## Resume\n\n{base_resume}\n\n## Job Description\n\n{job_description}"

    async def event_stream():
        yield f"data: {json.dumps({'status': 'generating', 'message': 'Generating tailored resume with AI\u2026'})}\n\n"

        # Collect full markdown from Claude
        full_markdown = ""
        try:
            if isinstance(client, AsyncAnthropic):
                async with client.messages.stream(
                    model=model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                ) as stream:
                    async for text in stream.text_stream:
                        full_markdown += text
            else:
                stream = await client.chat.completions.create(
                    model=model,
                    max_tokens=4096,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    stream=True,
                )
                async for chunk in stream:
                    text = chunk.choices[0].delta.content or ""
                    full_markdown += text
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        yield f"data: {json.dumps({'status': 'creating_doc', 'message': 'Creating Google Doc\u2026'})}\n\n"

        # Convert markdown → HTML
        html_content = md_lib.markdown(full_markdown, extensions=["extra"])

        # Create Google Doc
        try:
            doc_data = await create_google_doc_from_html(user["sub"], title, html_content)
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': f'Failed to create Google Doc: {e}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        google_doc_id = doc_data["id"]
        now = _now()
        resume_id = str(uuid.uuid4())

        # Persist to DB
        with Session(get_engine()) as session:
            # Validate category_id belongs to user
            if category_id:
                cat = session.get(GDocCategory, category_id)
                valid_cat = category_id if (cat and cat.user_id == user["sub"]) else None
            else:
                valid_cat = None

            gdoc_resume = GDocResume(
                id=resume_id,
                user_id=user["sub"],
                category_id=valid_cat,
                google_doc_id=google_doc_id,
                title=title,
                job_description=job_description[:2000],  # trim for storage
                created_at=now,
                updated_at=now,
            )
            session.add(gdoc_resume)
            session.commit()

        result = {
            "status": "done",
            "id": resume_id,
            "google_doc_id": google_doc_id,
            "title": title,
            "category_id": valid_cat,
            "google_doc_url": f"https://docs.google.com/document/d/{google_doc_id}/edit",
            "preview_url": f"https://docs.google.com/document/d/{google_doc_id}/preview",
            "created_at": now,
            "updated_at": now,
        }
        yield f"data: {json.dumps(result)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/resumes/{resume_id}")
async def update_resume(resume_id: str, request: Request, user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    with Session(get_engine()) as session:
        r = session.get(GDocResume, resume_id)
        if r is None or r.user_id != user["sub"]:
            raise HTTPException(status_code=404, detail="Resume not found")
        if "title" in body and body["title"].strip():
            r.title = body["title"].strip()
        if "category_id" in body:
            r.category_id = body["category_id"] or None
        r.updated_at = _now()
        session.add(r)
        session.commit()
        session.refresh(r)
        return _resume_to_dict(r)


@router.delete("/resumes/{resume_id}", status_code=204)
async def delete_resume(resume_id: str, user: dict = Depends(get_current_user)) -> None:
    with Session(get_engine()) as session:
        r = session.get(GDocResume, resume_id)
        if r is None or r.user_id != user["sub"]:
            raise HTTPException(status_code=404, detail="Resume not found")
        session.delete(r)
        session.commit()
