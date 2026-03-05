import io
from typing import Optional

import pdfplumber
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from pydantic import BaseModel

import storage
from deps import get_current_user
from llm_client import get_client

router = APIRouter()


class ResumeUpdate(BaseModel):
    content: str


class VersionCreate(BaseModel):
    name: str
    content: str


class VersionUpdate(BaseModel):
    content: Optional[str] = None
    name: Optional[str] = None


# ---------------------------------------------------------------------------
# Legacy endpoints — operate on the active version
# ---------------------------------------------------------------------------


@router.get("")
async def get_resume(user: dict = Depends(get_current_user)) -> dict:
    content = storage.load_resume(user["sub"])
    return {"content": content}


@router.put("")
async def update_resume(
    body: ResumeUpdate,
    user: dict = Depends(get_current_user),
) -> dict:
    storage.save_resume(user["sub"], body.content)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Version endpoints — must be registered before /{version_id} routes
# ---------------------------------------------------------------------------


@router.get("/versions")
async def list_versions(user: dict = Depends(get_current_user)) -> list:
    return storage.list_versions(user["sub"])


@router.post("/versions")
async def create_version(
    body: VersionCreate,
    user: dict = Depends(get_current_user),
) -> dict:
    meta = storage.create_version(user["sub"], body.name, body.content)
    storage.set_active_version(user["sub"], meta["id"])
    return {**meta, "is_active": True}


@router.get("/versions/{version_id}")
async def get_version(
    version_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    content = storage.load_version(user["sub"], version_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Version not found")
    storage.set_active_version(user["sub"], version_id)
    return {"content": content, "version_id": version_id}


@router.put("/versions/{version_id}")
async def update_version(
    version_id: str,
    body: VersionUpdate,
    user: dict = Depends(get_current_user),
) -> dict:
    meta = storage.save_version(
        user["sub"],
        version_id,
        content=body.content,
        new_name=body.name,
    )
    if meta is None:
        raise HTTPException(status_code=404, detail="Version not found")
    active_id = storage.get_active_version_id(user["sub"])
    return {**meta, "is_active": meta["id"] == active_id}


@router.delete("/versions/{version_id}")
async def delete_version(
    version_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    ok = storage.delete_version(user["sub"], version_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete the last version")
    return {"ok": True}


_PDF_IMPORT_SYSTEM = """\
You are a resume formatting expert. You will receive raw text extracted from a PDF resume. \
Your task is to reformat it as clean, structured Markdown matching the following conventions:

1. The first block is the candidate's name and contact info (no section heading).
2. Section headings use bold ALL-CAPS on their own line, e.g. **WORK EXPERIENCE**, **SKILLS**, **EDUCATION**, **PROJECTS**, **PUBLICATIONS**.
3. Job entries: **Company Name** • **MM/YYYY - MM/YYYY** on one line, then **Job Title** on the next line, then bullet points starting with *.
4. Bullet points use * (not -).
5. Do NOT invent or embellish any content — only reformat what is present.
6. Output ONLY the Markdown resume, no commentary or preamble."""

_PDF_IMPORT_USER = """\
Please reformat the following extracted PDF resume text as clean Markdown:

{text}"""

_PDF_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/import-pdf")
async def import_pdf(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Accept a PDF resume upload, extract text, reformat via Claude, and save as a new version."""
    # Validate content type
    if file.content_type not in ("application/pdf", "application/octet-stream") and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

    raw = await file.read()

    # Enforce 5 MB limit
    if len(raw) > _PDF_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5 MB")

    # Validate that it looks like a PDF
    if not raw.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Uploaded file does not appear to be a valid PDF")

    # Extract text with pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
        extracted = "\n\n".join(t for t in pages_text if t.strip())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to extract text from PDF: {exc}")

    if not extracted.strip():
        raise HTTPException(status_code=422, detail="No readable text found in the PDF")

    # Reformat with Claude
    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        if isinstance(client, AsyncAnthropic):
            message = await client.messages.create(
                model=model,
                max_tokens=4096,
                system=_PDF_IMPORT_SYSTEM,
                messages=[{"role": "user", "content": _PDF_IMPORT_USER.format(text=extracted)}],
            )
            reformatted = message.content[0].text
        else:
            response = await client.chat.completions.create(
                model=model,
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": _PDF_IMPORT_SYSTEM},
                    {"role": "user", "content": _PDF_IMPORT_USER.format(text=extracted)},
                ],
            )
            reformatted = response.choices[0].message.content or extracted
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM reformatting failed: {exc}")

    # Save as a new version
    base_name = (file.filename or "resume").removesuffix(".pdf")
    version_name = f"Imported: {base_name}"
    meta = storage.create_version(user["sub"], version_name, reformatted)
    storage.set_active_version(user["sub"], meta["id"])

    return {"version": {**meta, "is_active": True}, "content": reformatted}
