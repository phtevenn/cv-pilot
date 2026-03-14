import json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from database import GDocCategory, GDocResume, GDocTemplate, get_engine
from deps import get_current_user
from gdocs_client import (
    create_styled_doc_in_folder,
    delete_drive_file,
    fetch_doc_as_text,
    fill_template_doc,
    get_folder_id,
    get_or_create_folder,
    has_drive_access,
    list_docs_in_folder,
    rename_drive_file,
)
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
# Folder
# ---------------------------------------------------------------------------

@router.get("/folder")
async def get_folder(user: dict = Depends(get_current_user)) -> dict:
    """Return (creating if needed) the CV Pilot Drive folder info."""
    if not has_drive_access(user["sub"]):
        raise HTTPException(status_code=403, detail="Google Drive not connected")
    folder_id = await get_or_create_folder(user["sub"])
    return {
        "folder_id": folder_id,
        "folder_url": f"https://drive.google.com/drive/folders/{folder_id}",
    }


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)) -> dict:
    with Session(get_engine()) as session:
        stmt = select(GDocTemplate).where(GDocTemplate.user_id == user["sub"])
        templates = session.exec(stmt).all()
        return {
            "templates": [
                {"id": t.id, "google_doc_id": t.google_doc_id, "name": t.name, "created_at": t.created_at}
                for t in templates
            ]
        }


@router.post("/templates", status_code=201)
async def create_template(request: Request, user: dict = Depends(get_current_user)) -> dict:
    body = await request.json()
    name = body.get("name", "").strip()
    google_doc_url = body.get("google_doc_url", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if not google_doc_url:
        raise HTTPException(status_code=422, detail="google_doc_url is required")
    m = re.search(r"/document/d/([a-zA-Z0-9_-]+)", google_doc_url)
    if not m:
        raise HTTPException(status_code=422, detail="Invalid Google Docs URL")
    google_doc_id = m.group(1)
    template = GDocTemplate(
        id=str(uuid.uuid4()),
        user_id=user["sub"],
        google_doc_id=google_doc_id,
        name=name,
        created_at=_now(),
        updated_at=_now(),
    )
    with Session(get_engine()) as session:
        session.add(template)
        session.commit()
        session.refresh(template)
        return {
            "id": template.id,
            "google_doc_id": template.google_doc_id,
            "name": template.name,
            "created_at": template.created_at,
        }


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(template_id: str, user: dict = Depends(get_current_user)) -> None:
    with Session(get_engine()) as session:
        t = session.get(GDocTemplate, template_id)
        if t is None or t.user_id != user["sub"]:
            raise HTTPException(status_code=404, detail="Template not found")
        session.delete(t)
        session.commit()


# ---------------------------------------------------------------------------
# GDoc Resumes — Drive is source of truth, SQLite stores only category tags
# ---------------------------------------------------------------------------

def _drive_file_to_dict(f: dict, category_id: Optional[str]) -> dict:
    doc_id = f["id"]
    return {
        "id": doc_id,
        "google_doc_id": doc_id,
        "title": f.get("name", "Untitled"),
        "category_id": category_id,
        "google_doc_url": f.get("webViewLink", f"https://docs.google.com/document/d/{doc_id}/edit"),
        "preview_url": f"https://docs.google.com/document/d/{doc_id}/preview",
        "created_at": f.get("createdTime", ""),
        "updated_at": f.get("modifiedTime", ""),
    }


def _load_category_map(user_id: str) -> dict[str, Optional[str]]:
    """Return {google_doc_id: category_id} from SQLite metadata."""
    with Session(get_engine()) as session:
        stmt = select(GDocResume).where(GDocResume.user_id == user_id)
        return {r.google_doc_id: r.category_id for r in session.exec(stmt).all()}


def _upsert_category(user_id: str, google_doc_id: str, category_id: Optional[str]) -> None:
    """Store or update the category tag for a doc in SQLite."""
    with Session(get_engine()) as session:
        r = session.get(GDocResume, google_doc_id)
        if r is None:
            r = GDocResume(
                id=google_doc_id,
                user_id=user_id,
                google_doc_id=google_doc_id,
                title="",
                category_id=category_id,
                created_at=_now(),
                updated_at=_now(),
            )
        else:
            r.category_id = category_id
            r.updated_at = _now()
        session.add(r)
        session.commit()


@router.get("/resumes")
async def list_resumes(
    user: dict = Depends(get_current_user),
    category_id: Optional[str] = None,
) -> dict:
    if not has_drive_access(user["sub"]):
        raise HTTPException(status_code=403, detail="Google Drive not connected")
    folder_id = await get_or_create_folder(user["sub"])
    drive_files = await list_docs_in_folder(user["sub"], folder_id)
    cat_map = _load_category_map(user["sub"])
    resumes = [_drive_file_to_dict(f, cat_map.get(f["id"])) for f in drive_files]
    if category_id:
        resumes = [r for r in resumes if r["category_id"] == category_id]
    return {"resumes": resumes}


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_JSON = """\
You are a professional resume optimizer. Given a resume and a job description, \
output a JSON object representing a tailored resume that targets the role.

OUTPUT FORMAT: Return ONLY valid JSON — no markdown code fences, no commentary.

The JSON must follow this exact schema:
{{
  "name": "Full Name",
  "title": "Professional Title / Industry Focus",
  "industry": "Industry",
  "contact": {{
    "email": "...",
    "phone": "...",
    "linkedin": "...",
    "location": "City, State"
  }},
  "summary": "1-2 sentence professional summary",
  "skills": {{
    "technical": "comma-separated technical skills",
    "domain": "domain expertise",
    "tools": "tools and technologies",
    "languages": "programming languages or empty string",
    "soft": "soft skills or empty string"
  }},
  "experience": [
    {{
      "title": "Job Title",
      "company": "Company Name",
      "dates": "MM/YYYY - MM/YYYY or Present",
      "location": "City, State or empty string",
      "bullets": ["bullet point 1", "bullet point 2"]
    }}
  ],
  "education": [
    {{
      "degree": "Degree Name",
      "school": "School Name",
      "graduation": "MM/YYYY",
      "location": "City, State or empty string",
      "gpa": "GPA or empty string",
      "details": []
    }}
  ],
  "projects": [
    {{
      "name": "Project Name",
      "stack": "Technologies used",
      "bullets": ["description bullet"]
    }}
  ],
  "certifications": [
    {{
      "name": "Certification Name",
      "org": "Issuing Organization",
      "year": "Year"
    }}
  ],
  "publications": ["Full citation as a string"],
  "volunteer": [
    {{
      "role": "Role Title",
      "org": "Organization",
      "dates": "MM/YYYY - MM/YYYY",
      "bullets": ["bullet point"]
    }}
  ]
}}

RULES:
1. Strengthen bullet points with impact-driven language and keywords from the job description.
2. Do not invent experience or credentials not present in the original resume.
3. Use empty arrays [] for sections absent from the original.
4. The tailored resume must fit within {page_limit} page{page_limit_plural}.\
"""

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
    source_doc_id: Optional[str] = body.get("source_doc_id") or None
    custom_instructions: str = (body.get("custom_instructions") or "").strip()
    template_doc_id: Optional[str] = body.get("template_doc_id") or None

    if not job_description.strip():
        raise HTTPException(status_code=422, detail="job_description is required")

    if not has_drive_access(user["sub"]):
        raise HTTPException(status_code=403, detail="Google Drive not connected")

    # Load base resume: from a source Google Doc if provided, else the editor resume
    import storage
    if source_doc_id:
        try:
            base_resume = await fetch_doc_as_text(user["sub"], source_doc_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read source Google Doc: {e}")
    else:
        base_resume = storage.load_resume(user["sub"])

    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    use_template = template_doc_id is not None
    if use_template:
        system_prompt = _SYSTEM_PROMPT_JSON.format(
            page_limit=page_limit,
            page_limit_plural="s" if page_limit > 1 else "",
        )
    else:
        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
            page_limit=page_limit,
            page_limit_plural="s" if page_limit > 1 else "",
        )

    user_message = f"## Resume\n\n{base_resume}\n\n## Job Description\n\n{job_description}"
    if custom_instructions:
        user_message += f"\n\n## Additional Instructions\n\n{custom_instructions}"

    async def event_stream():
        generating_msg = "Generating resume data with AI\u2026" if use_template else "Generating tailored resume with AI\u2026"
        yield f"data: {json.dumps({'status': 'generating', 'message': generating_msg})}\n\n"

        # Collect full output from Claude
        full_output = ""
        try:
            if isinstance(client, AsyncAnthropic):
                async with client.messages.stream(
                    model=model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                ) as stream:
                    async for text in stream.text_stream:
                        full_output += text
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
                    full_output += text
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
            return

        creating_msg = "Filling template\u2026" if use_template else "Creating Google Doc\u2026"
        yield f"data: {json.dumps({'status': 'creating_doc', 'message': creating_msg})}\n\n"

        # Create the doc
        try:
            folder_id = await get_or_create_folder(user["sub"])
            if use_template:
                # Parse JSON output from Claude
                try:
                    resume_json = json.loads(full_output.strip())
                except json.JSONDecodeError as e:
                    raise ValueError(f"AI output was not valid JSON: {e}")
                doc_data = await fill_template_doc(user["sub"], template_doc_id, title, resume_json, folder_id)
            else:
                doc_data = await create_styled_doc_in_folder(user["sub"], title, full_output, folder_id)
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': f'Failed to create Google Doc: {e}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        google_doc_id = doc_data["id"]

        # Validate and persist category tag
        valid_cat: Optional[str] = None
        if category_id:
            with Session(get_engine()) as session:
                cat = session.get(GDocCategory, category_id)
                if cat and cat.user_id == user["sub"]:
                    valid_cat = category_id
        if valid_cat is not None:
            _upsert_category(user["sub"], google_doc_id, valid_cat)

        result = {
            "status": "done",
            "id": google_doc_id,
            "google_doc_id": google_doc_id,
            "title": title,
            "category_id": valid_cat,
            "google_doc_url": doc_data.get("webViewLink", f"https://docs.google.com/document/d/{google_doc_id}/edit"),
            "preview_url": f"https://docs.google.com/document/d/{google_doc_id}/preview",
            "created_at": doc_data.get("createdTime", _now()),
            "updated_at": doc_data.get("modifiedTime", _now()),
        }
        yield f"data: {json.dumps(result)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/resumes/{doc_id}")
async def update_resume(doc_id: str, request: Request, user: dict = Depends(get_current_user)) -> dict:
    """Rename in Drive and/or update category in SQLite."""
    body = await request.json()
    new_title: Optional[str] = body.get("title", "").strip() or None
    new_category: Optional[str] = body.get("category_id", "UNSET")  # sentinel to detect omission

    if new_title:
        await rename_drive_file(user["sub"], doc_id, new_title)

    if new_category != "UNSET":
        _upsert_category(user["sub"], doc_id, new_category or None)

    # Return updated metadata from Drive
    from gdocs_client import _get_valid_access_token
    import httpx
    access_token = await _get_valid_access_token(user["sub"])
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{doc_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "id,name,webViewLink,createdTime,modifiedTime"},
        )
        resp.raise_for_status()
        f = resp.json()

    cat_map = _load_category_map(user["sub"])
    return _drive_file_to_dict(f, cat_map.get(doc_id))


@router.delete("/resumes/{doc_id}", status_code=204)
async def delete_resume(doc_id: str, user: dict = Depends(get_current_user)) -> None:
    """Delete from Drive and remove category metadata from SQLite."""
    await delete_drive_file(user["sub"], doc_id)
    with Session(get_engine()) as session:
        r = session.get(GDocResume, doc_id)
        if r and r.user_id == user["sub"]:
            session.delete(r)
            session.commit()
