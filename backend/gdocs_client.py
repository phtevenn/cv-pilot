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
    CSS = "@page { margin: 0.75in; }"

    _DATE_PAT = _re.compile(r'\b(19|20)\d{2}\b|present|current', _re.I)
    _ENTRY_HEADING_PAT = _re.compile(r'\*\*')

    def _is_entry_heading(line: str) -> bool:
        """True if line has bold AND (a year/present/current OR a bullet/pipe separator)."""
        if not _ENTRY_HEADING_PAT.search(line):
            return False
        return bool(_DATE_PAT.search(line)) or '•' in line or ' | ' in line

    def _split_entry_heading(line: str) -> tuple[str, str]:
        """Split entry heading into (left, right) for table rendering."""
        # Try bullet separator first
        if '•' in line:
            idx = line.index('•')
            left_raw = line[:idx].strip()
            right_raw = line[idx + 1:].strip()
            return left_raw, right_raw
        # Try last ' | ' separator
        last_pipe = line.rfind(' | ')
        if last_pipe != -1:
            left_raw = line[:last_pipe].strip()
            right_raw = line[last_pipe + 3:].strip()
            return left_raw, right_raw
        # No clear split — return full line as left, empty right
        return line, ''

    lines = markdown_text.strip().split('\n')
    parts: list[str] = []
    in_ul = False
    header_done = False       # True once we've seen the first section header
    name_seen = False
    current_section = ''      # lowercase section name for context-aware rendering
    last_was_entry_heading = False  # True if previous meaningful line was an entry heading

    def close_ul() -> None:
        nonlocal in_ul
        if in_ul:
            parts.append('</ul>')
            in_ul = False

    def open_ul() -> None:
        nonlocal in_ul
        if not in_ul:
            parts.append(
                '<ul style="margin:1pt 0 4pt 0; padding-left:16pt;">'
            )
            in_ul = True

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
            parts.append(
                f'<p style="font-size:16.5pt; font-weight:700; text-align:center;'
                f' text-transform:uppercase; letter-spacing:0.18em; color:#111827;'
                f' margin:0 0 2pt 0;">{_html.escape(name_text)}</p>'
            )
            name_seen = True
            last_was_entry_heading = False
            continue

        # Section header: **ALL CAPS** on its own line (may include spaces, /, &, (, ))
        sec_match = _re.match(r'^\*\*([A-Z][A-Z0-9 /&()\-]+)\*\*\s*$', s)
        if sec_match:
            close_ul()
            sec_text = sec_match.group(1)
            current_section = sec_text.lower().strip()
            parts.append(
                f'<p style="font-size:8pt; font-weight:700; text-transform:uppercase;'
                f' letter-spacing:0.14em; color:#374151;'
                f' border-bottom:0.75pt solid #9ca3af;'
                f' margin:12pt 0 3pt 0; padding-bottom:2pt;">'
                f'{_html.escape(sec_text)}</p>'
            )
            header_done = True
            last_was_entry_heading = False
            continue

        # Bullet point
        if _re.match(r'^[-*•]\s+', s):
            open_ul()
            text = _re.sub(r'^[-*•]\s+', '', s)
            parts.append(
                f'<li style="font-size:10pt; color:#374151;'
                f' line-height:1.35; margin-bottom:1.5pt;">'
                f'{_inline_md_to_html(text)}</li>'
            )
            last_was_entry_heading = False
            continue

        close_ul()

        # --- Header block (before first section header) ---
        if not header_done:
            # Contact info: contains | or @ or phone pattern or common link keywords
            if (
                '|' in s or '@' in s
                or _re.search(r'\d{3}[-.)]\d{3}', s)
                or _re.search(r'linkedin|github|http', s, _re.I)
            ):
                pieces = [p.strip() for p in s.split('|')]
                contact_html = ' • '.join(_html.escape(p) for p in pieces if p)
                parts.append(
                    f'<p style="font-size:8.5pt; text-align:center; color:#6b7280;'
                    f' margin:0 0 10pt 0; letter-spacing:0.025em;">'
                    f'{contact_html}</p>'
                )
                last_was_entry_heading = False
                continue

            # Name (bold or plain, before first section header, no name yet)
            if not name_seen:
                bold_name = _re.match(r'^\*\*(.+)\*\*$', s)
                if bold_name:
                    parts.append(
                        f'<p style="font-size:16.5pt; font-weight:700; text-align:center;'
                        f' text-transform:uppercase; letter-spacing:0.18em; color:#111827;'
                        f' margin:0 0 2pt 0;">{_html.escape(bold_name.group(1))}</p>'
                    )
                    name_seen = True
                    last_was_entry_heading = False
                    continue
                if not _re.search(r'[|@•]', s):
                    parts.append(
                        f'<p style="font-size:16.5pt; font-weight:700; text-align:center;'
                        f' text-transform:uppercase; letter-spacing:0.18em; color:#111827;'
                        f' margin:0 0 2pt 0;">{_html.escape(s)}</p>'
                    )
                    name_seen = True
                    last_was_entry_heading = False
                    continue

        # --- Body section lines ---

        # Entry heading: bold + year/present/current or separator
        if _is_entry_heading(s):
            left_raw, right_raw = _split_entry_heading(s)
            left_html = _inline_md_to_html(left_raw)
            right_html = _inline_md_to_html(right_raw) if right_raw else ''
            if right_html:
                parts.append(
                    f'<table width="100%" cellpadding="0" cellspacing="0"'
                    f' style="border-collapse:collapse; margin:6pt 0 1pt 0;">'
                    f'<tr>'
                    f'<td style="font-size:10.5pt; font-weight:600; color:#111827;">'
                    f'{left_html}</td>'
                    f'<td style="font-size:9pt; color:#6b7280; text-align:right;'
                    f' white-space:nowrap; vertical-align:top;">'
                    f'{right_html}</td>'
                    f'</tr></table>'
                )
            else:
                parts.append(
                    f'<p style="font-size:10.5pt; font-weight:600; color:#111827;'
                    f' margin:6pt 0 1pt 0;">{left_html}</p>'
                )
            last_was_entry_heading = True
            continue

        # Job title: non-empty, non-bullet, non-section-header line immediately after entry heading
        if last_was_entry_heading:
            parts.append(
                f'<p style="font-size:10pt; font-style:italic; color:#4b5563;'
                f' margin:0 0 2pt 0;">{_inline_md_to_html(s)}</p>'
            )
            last_was_entry_heading = False
            continue

        # Skills section: Label: value(s) pattern
        if any(kw in current_section for kw in ('skill', 'technical')):
            skill_match = _re.match(r'^([^:]{2,30}):\s+(.+)$', s)
            if skill_match:
                label = _html.escape(skill_match.group(1))
                value = _html.escape(skill_match.group(2))
                parts.append(
                    f'<p style="font-size:10pt; margin:0 0 2pt 0;">'
                    f'<strong style="font-weight:600; color:#111827;">{label}:</strong>'
                    f' <span style="color:#374151;">{value}</span></p>'
                )
                continue

        # Default body paragraph
        parts.append(
            f'<p style="font-size:10pt; color:#374151; margin:0 0 3pt 0;">'
            f'{_inline_md_to_html(s)}</p>'
        )
        last_was_entry_heading = False

    close_ul()
    content = '\n'.join(parts)
    return (
        '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        f'<style>{CSS}</style>'
        f'<body style="font-family:Arial,sans-serif; font-size:10pt; color:#374151;'
        f' line-height:1.35; margin:0;">'
        f'{content}</body></html>'
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
