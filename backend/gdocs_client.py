"""Google Drive / Docs API helpers."""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from sqlmodel import Session

from database import UserGoogleToken, get_engine

_FOLDER_NAME = "CV Pilot Resumes"
_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"


async def _get_valid_access_token(user_id: str) -> str:
    """Return a valid access token, refreshing if expired."""
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        if tok is None:
            raise ValueError("No Google tokens for user — Drive not connected")
        if tok.token_expiry:
            expiry = datetime.fromisoformat(tok.token_expiry)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expiry - timedelta(minutes=5):
                if not tok.refresh_token:
                    raise ValueError("Access token expired and no refresh token available")
                from auth_utils import refresh_google_access_token
                new_data = await refresh_google_access_token(tok.refresh_token)
                new_expiry = None
                if "expires_in" in new_data:
                    new_expiry = (
                        datetime.now(timezone.utc) + timedelta(seconds=int(new_data["expires_in"]))
                    ).isoformat()
                tok.access_token = new_data["access_token"]
                tok.token_expiry = new_expiry
                session.add(tok)
                session.commit()
                return new_data["access_token"]
        return tok.access_token


async def get_or_create_folder(user_id: str) -> str:
    """Return the CV Pilot folder ID, creating it in Drive if it doesn't exist yet."""
    # Check cache in DB first
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        if tok and tok.folder_id:
            return tok.folder_id

    access_token = await _get_valid_access_token(user_id)

    async with httpx.AsyncClient() as client:
        # Search for an existing folder with this name
        resp = await client.get(
            _DRIVE_FILES_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": (
                    f"name='{_FOLDER_NAME}' "
                    "and mimeType='application/vnd.google-apps.folder' "
                    "and trashed=false"
                ),
                "fields": "files(id)",
            },
        )
        resp.raise_for_status()
        files = resp.json().get("files", [])

        if files:
            folder_id = files[0]["id"]
        else:
            # Create the folder
            resp = await client.post(
                _DRIVE_FILES_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"name": _FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"},
            )
            resp.raise_for_status()
            folder_id = resp.json()["id"]

    # Cache the folder ID
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        if tok:
            tok.folder_id = folder_id
            session.add(tok)
            session.commit()

    return folder_id


async def list_docs_in_folder(user_id: str, folder_id: str) -> list[dict]:
    """Return all Google Docs in the folder, ordered by modifiedTime desc."""
    access_token = await _get_valid_access_token(user_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            _DRIVE_FILES_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": (
                    f"'{folder_id}' in parents "
                    "and mimeType='application/vnd.google-apps.document' "
                    "and trashed=false"
                ),
                "fields": "files(id,name,createdTime,modifiedTime,webViewLink)",
                "orderBy": "modifiedTime desc",
            },
        )
        resp.raise_for_status()
        return resp.json().get("files", [])


async def create_doc_in_folder(user_id: str, title: str, html_content: str, folder_id: str) -> dict:
    """Create a Google Doc from HTML inside the given folder. Returns Drive file metadata."""
    access_token = await _get_valid_access_token(user_id)
    metadata = json.dumps({
        "name": title,
        "mimeType": "application/vnd.google-apps.document",
        "parents": [folder_id],
    })
    boundary = "cv_pilot_boundary"
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: text/html; charset=UTF-8\r\n\r\n"
        f"{html_content}\r\n"
        f"--{boundary}--"
    ).encode("utf-8")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink,createdTime,modifiedTime",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=body,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


async def rename_drive_file(user_id: str, file_id: str, new_title: str) -> None:
    """Rename a file in Drive."""
    access_token = await _get_valid_access_token(user_id)
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{_DRIVE_FILES_URL}/{file_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            params={"fields": "id"},
            json={"name": new_title},
        )
        resp.raise_for_status()


async def delete_drive_file(user_id: str, file_id: str) -> None:
    """Permanently delete a file from Drive."""
    access_token = await _get_valid_access_token(user_id)
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{_DRIVE_FILES_URL}/{file_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()


def has_drive_access(user_id: str) -> bool:
    """Check if the user has connected their Google Drive."""
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        return tok is not None and bool(tok.access_token)


def get_folder_id(user_id: str) -> Optional[str]:
    """Return cached folder ID, or None if not yet initialised."""
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        return tok.folder_id if tok else None


import html as _html
import re as _re


def _strip_inline_bold(text: str) -> str:
    return _re.sub(r'\*\*(.+?)\*\*', r'\1', text)


def _inline_md_to_html(text: str) -> str:
    """Convert inline markdown bold/italic to HTML, HTML-escaping the rest."""
    result = []
    remaining = text
    bold_pat = _re.compile(r'\*\*(.+?)\*\*')
    while True:
        m = bold_pat.search(remaining)
        if not m:
            result.append(_html.escape(remaining))
            break
        result.append(_html.escape(remaining[:m.start()]))
        result.append(f'<strong>{_html.escape(m.group(1))}</strong>')
        remaining = remaining[m.end():]
    return ''.join(result)


def markdown_to_resume_html(markdown_text: str) -> str:
    """Convert Claude's resume markdown to styled HTML suitable for Google Docs import."""
    CSS = """
@page { margin: 0.75in; }
body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #000; line-height: 1.35; margin: 0; }
.rn { font-size: 18pt; font-weight: bold; text-align: center; margin: 0 0 3pt 0; }
.rc { font-size: 10pt; text-align: center; color: #444; margin: 0 0 10pt 0; }
.rs { font-size: 11pt; font-weight: bold; border-bottom: 1.5pt solid #222; margin: 10pt 0 3pt 0; padding-bottom: 2pt; letter-spacing: 0.03em; }
.rr { font-size: 10.5pt; margin: 4pt 0 1pt 0; }
ul { margin: 1pt 0 4pt 0; padding-left: 16pt; }
li { font-size: 10.5pt; margin-bottom: 1.5pt; }
p { margin: 0 0 3pt 0; font-size: 10.5pt; }
"""
    lines = markdown_text.strip().split('\n')
    parts: list[str] = []
    in_ul = False
    header_done = False  # True once we've seen the first section header

    def close_ul() -> None:
        nonlocal in_ul
        if in_ul:
            parts.append('</ul>')
            in_ul = False

    def open_ul() -> None:
        nonlocal in_ul
        if not in_ul:
            parts.append('<ul>')
            in_ul = True

    name_seen = False

    for raw in lines:
        s = raw.strip()

        # Blank line
        if not s:
            close_ul()
            continue

        # H1/H2 heading → name
        h_match = _re.match(r'^#{1,2}\s+(.+)$', s)
        if h_match:
            close_ul()
            name_text = _strip_inline_bold(h_match.group(1))
            parts.append(f'<p class="rn">{_html.escape(name_text)}</p>')
            name_seen = True
            continue

        # Section header: **ALL CAPS** on its own line (may include spaces, /, &, (, ))
        sec_match = _re.match(r'^\*\*([A-Z][A-Z0-9 /&()\-]+)\*\*\s*$', s)
        if sec_match:
            close_ul()
            parts.append(f'<p class="rs">{_html.escape(sec_match.group(1))}</p>')
            header_done = True
            continue

        # Bullet point
        if _re.match(r'^[-*•]\s+', s):
            open_ul()
            text = _re.sub(r'^[-*•]\s+', '', s)
            parts.append(f'<li>{_inline_md_to_html(text)}</li>')
            continue

        close_ul()

        # Contact info: in the header block and contains | or @ or phone pattern
        if not header_done and (
            '|' in s or '@' in s
            or _re.search(r'\d{3}[-.)]\d{3}', s)
            or _re.search(r'linkedin|github|http', s, _re.I)
        ):
            pieces = [p.strip() for p in s.split('|')]
            contact_html = ' • '.join(_html.escape(p) for p in pieces if p)
            parts.append(f'<p class="rc">{contact_html}</p>')
            continue

        # Name (bold only, before first section header, no name yet)
        if not header_done and not name_seen:
            bold_name = _re.match(r'^\*\*(.+)\*\*$', s)
            if bold_name:
                parts.append(f'<p class="rn">{_html.escape(bold_name.group(1))}</p>')
                name_seen = True
                continue
            # Plain first line before contact info → treat as name
            if not _re.search(r'[|@•]', s):
                parts.append(f'<p class="rn">{_html.escape(s)}</p>')
                name_seen = True
                continue

        # Role/subheading lines (have bold or pipe separator after header block)
        if _re.search(r'\*\*', s) or ('|' in s and header_done):
            parts.append(f'<p class="rr">{_inline_md_to_html(s)}</p>')
            continue

        # Default body paragraph
        parts.append(f'<p>{_inline_md_to_html(s)}</p>')

    close_ul()
    content = '\n'.join(parts)
    return (
        '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        f'<style>{CSS}</style></head><body>{content}</body></html>'
    )


async def fetch_doc_as_text(user_id: str, doc_id: str) -> str:
    """Export a Google Doc as plain text using the Drive export API."""
    access_token = await _get_valid_access_token(user_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{doc_id}/export",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"mimeType": "text/plain"},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.text


async def set_doc_margins(user_id: str, doc_id: str) -> None:
    """Use the Google Docs API to set 0.75in page margins. Non-fatal on failure."""
    try:
        access_token = await _get_valid_access_token(user_id)
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "requests": [
                        {
                            "updateDocumentStyle": {
                                "documentStyle": {
                                    "marginTop": {"magnitude": 54, "unit": "PT"},
                                    "marginBottom": {"magnitude": 54, "unit": "PT"},
                                    "marginLeft": {"magnitude": 54, "unit": "PT"},
                                    "marginRight": {"magnitude": 54, "unit": "PT"},
                                },
                                "fields": "marginTop,marginBottom,marginLeft,marginRight",
                            }
                        }
                    ]
                },
                timeout=15,
            )
            if resp.status_code != 200:
                print(f"[gdocs] Warning: set_doc_margins failed ({resp.status_code}): {resp.text[:200]}")
    except Exception as exc:
        print(f"[gdocs] Warning: set_doc_margins exception: {exc}")
