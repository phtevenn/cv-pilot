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

# ---------------------------------------------------------------------------
# Google Docs API — native formatting helpers
# ---------------------------------------------------------------------------

_DOCS_API = "https://docs.googleapis.com/v1/documents"
_CONTENT_WIDTH_PT = 504.0  # 8.5in page - 0.75in*2 margins = 7in = 504pt


def _pt(n: float) -> dict:
    return {"magnitude": n, "unit": "PT"}


def _rgb(hex_color: str) -> dict:
    h = hex_color.lstrip("#")
    return {"red": int(h[0:2], 16) / 255.0, "green": int(h[2:4], 16) / 255.0, "blue": int(h[4:6], 16) / 255.0}


def _opt_color(hex_color: str) -> dict:
    return {"color": {"rgbColor": _rgb(hex_color)}}


def _text_color(hex_color: str) -> dict:
    return {"foregroundColor": _opt_color(hex_color)}


def _parse_resume_segments(markdown_text: str) -> list[dict]:
    """Parse markdown resume into typed segments for Docs API rendering."""
    segs: list[dict] = []
    lines = markdown_text.strip().split("\n")
    header_done = False
    name_seen = False
    last_was_entry = False
    current_section = ""

    for raw in lines:
        s = raw.strip()

        if not s:
            if segs and segs[-1]["type"] != "blank":
                segs.append({"type": "blank"})
            last_was_entry = False
            continue

        # H1/H2 → name
        h = _re.match(r"^#{1,2}\s+(.+)$", s)
        if h:
            text = _re.sub(r"\*\*(.+?)\*\*", r"\1", h.group(1))
            segs.append({"type": "name", "text": text})
            name_seen = True
            last_was_entry = False
            continue

        # Section header: **ALL CAPS** alone on line
        sec = _re.match(r"^\*\*([A-Z][A-Z0-9 /&()\-]+)\*\*\s*$", s)
        if sec:
            segs.append({"type": "section", "text": sec.group(1)})
            header_done = True
            current_section = sec.group(1).lower()
            last_was_entry = False
            continue

        # Bullet point
        if _re.match(r"^[-*•]\s+", s):
            text = _re.sub(r"^[-*•]\s+", "", s)
            text = _re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            segs.append({"type": "bullet", "text": text})
            last_was_entry = False
            continue

        # Pre-section header block (name + contact)
        if not header_done:
            if (
                "|" in s or "@" in s
                or _re.search(r"\d{3}[-.)]\d{3}", s)
                or _re.search(r"linkedin|github|http", s, _re.I)
            ):
                text = " • ".join(p.strip() for p in s.split("|") if p.strip())
                text = _re.sub(r"\*\*(.+?)\*\*", r"\1", text)
                segs.append({"type": "contact", "text": text})
                last_was_entry = False
                continue
            if not name_seen:
                text = _re.sub(r"\*\*(.+?)\*\*", r"\1", s)
                segs.append({"type": "name", "text": text})
                name_seen = True
                last_was_entry = False
                continue

        # Entry heading: bold + (year/present/current OR bullet/pipe separator)
        if _re.search(r"\*\*", s) and (
            _re.search(r"\b(19|20)\d{2}\b|present|current", s, _re.I)
            or "•" in s or " | " in s
        ):
            plain = _re.sub(r"\*\*(.+?)\*\*", r"\1", s)
            if "•" in s:
                raw_left, _, raw_right = s.partition("•")
                left = _re.sub(r"\*\*(.+?)\*\*", r"\1", raw_left).strip()
                right = _re.sub(r"\*\*(.+?)\*\*", r"\1", raw_right).strip()
            elif " | " in plain:
                idx = plain.rfind(" | ")
                left = plain[:idx].strip()
                right = plain[idx + 3:].strip()
            else:
                left = plain.strip()
                right = ""
            segs.append({"type": "entry", "left": left, "right": right})
            last_was_entry = True
            continue

        # Job title: first non-blank non-bullet line after an entry heading
        if last_was_entry:
            text = _re.sub(r"\*\*(.+?)\*\*", r"\1", s)
            segs.append({"type": "jobtitle", "text": text})
            last_was_entry = False
            continue

        # Skills section
        if any(kw in current_section for kw in ("skill", "technical", "competenc", "tool")):
            m = _re.match(r"^([^:]{2,35}):\s+(.+)$", s)
            if m:
                segs.append({"type": "skill", "label": m.group(1).strip(), "value": m.group(2).strip()})
                last_was_entry = False
                continue

        # Default body
        text = _re.sub(r"\*\*(.+?)\*\*", r"\1", s)
        segs.append({"type": "body", "text": text})
        last_was_entry = False

    return segs


def _build_docs_requests(markdown_text: str) -> list:
    """Build Google Docs API batchUpdate requests to format a resume from markdown."""
    segs = _parse_resume_segments(markdown_text)

    # Build full plain text and track [start, end) positions per segment
    # Docs API body starts at index 1
    full_text = ""
    seg_info: list[tuple[int, int, dict]] = []
    pos = 1

    for seg in segs:
        stype = seg["type"]
        if stype == "blank":
            full_text += "\n"
            seg_info.append((pos, pos + 1, seg))
            pos += 1
        elif stype == "entry":
            left, right = seg["left"], seg.get("right", "")
            if right:
                text = f"{left}\t{right}\n"
                seg = {**seg, "_tab_pos": pos + len(left)}
            else:
                text = f"{left}\n"
                seg = {**seg, "_tab_pos": None}
            seg_info.append((pos, pos + len(text), seg))
            full_text += text
            pos += len(text)
        elif stype == "skill":
            text = f"{seg['label']}: {seg['value']}\n"
            seg = {**seg, "_label_end": pos + len(seg["label"]) + 1}  # +1 for ':'
            seg_info.append((pos, pos + len(text), seg))
            full_text += text
            pos += len(text)
        else:
            text = seg.get("text", "") + "\n"
            seg_info.append((pos, pos + len(text), seg))
            full_text += text
            pos += len(text)

    requests: list[dict] = []

    # 1. Document margins
    requests.append({
        "updateDocumentStyle": {
            "documentStyle": {
                "marginTop": _pt(54), "marginBottom": _pt(54),
                "marginLeft": _pt(54), "marginRight": _pt(54),
            },
            "fields": "marginTop,marginBottom,marginLeft,marginRight",
        }
    })

    # 2. Insert all text at once at index 1
    requests.append({
        "insertText": {"location": {"index": 1}, "text": full_text}
    })

    # 3. Per-segment formatting
    for start, end, seg in seg_info:
        stype = seg["type"]
        if stype == "blank":
            continue
        content_end = end - 1  # exclude trailing \n for text style
        if content_end <= start:
            continue

        if stype == "name":
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": True, "fontSize": _pt(16),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#111827"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "alignment": "CENTER", "spaceAbove": _pt(0), "spaceBelow": _pt(2),
                }, "fields": "alignment,spaceAbove,spaceBelow"}},
            ]

        elif stype == "contact":
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": False, "fontSize": _pt(9),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#6b7280"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "alignment": "CENTER", "spaceAbove": _pt(0), "spaceBelow": _pt(10),
                }, "fields": "alignment,spaceAbove,spaceBelow"}},
            ]

        elif stype == "section":
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": True, "fontSize": _pt(8.5),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#374151"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "spaceAbove": _pt(12), "spaceBelow": _pt(3),
                    "borderBottom": {
                        "color": _opt_color("#9ca3af"),
                        "width": _pt(0.75), "dashStyle": "SOLID", "padding": _pt(2),
                    },
                }, "fields": "spaceAbove,spaceBelow,borderBottom"}},
            ]

        elif stype == "entry":
            tab_pos = seg.get("_tab_pos")
            if tab_pos and tab_pos > start:
                requests += [
                    {"updateTextStyle": {"range": {"startIndex": start, "endIndex": tab_pos}, "textStyle": {
                        "bold": True, "fontSize": _pt(10.5),
                        "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#111827"),
                    }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
                    {"updateTextStyle": {"range": {"startIndex": tab_pos + 1, "endIndex": content_end}, "textStyle": {
                        "bold": False, "fontSize": _pt(9),
                        "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#6b7280"),
                    }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
                ]
            else:
                requests.append({"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": True, "fontSize": _pt(10.5),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#111827"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}})
            requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                "tabStops": [{"offset": _pt(_CONTENT_WIDTH_PT), "alignment": "END"}],
                "spaceAbove": _pt(6), "spaceBelow": _pt(1),
            }, "fields": "tabStops,spaceAbove,spaceBelow"}})

        elif stype == "jobtitle":
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": False, "italic": True, "fontSize": _pt(10),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#4b5563"),
                }, "fields": "bold,italic,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "spaceAbove": _pt(0), "spaceBelow": _pt(2),
                }, "fields": "spaceAbove,spaceBelow"}},
            ]

        elif stype == "bullet":
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": False, "italic": False, "fontSize": _pt(10),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#374151"),
                }, "fields": "bold,italic,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "spaceBelow": _pt(1.5),
                }, "fields": "spaceBelow"}},
            ]

        elif stype == "skill":
            label_end = seg.get("_label_end", start + 5)
            label_end = min(label_end, content_end)
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": label_end}, "textStyle": {
                    "bold": True, "fontSize": _pt(10),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#111827"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}},
            ]
            if label_end < content_end:
                requests.append({"updateTextStyle": {"range": {"startIndex": label_end, "endIndex": content_end}, "textStyle": {
                    "bold": False, "fontSize": _pt(10),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#374151"),
                }, "fields": "bold,fontSize,weightedFontFamily,foregroundColor"}})
            requests.append({"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                "spaceAbove": _pt(0), "spaceBelow": _pt(2),
            }, "fields": "spaceAbove,spaceBelow"}})

        else:  # body
            requests += [
                {"updateTextStyle": {"range": {"startIndex": start, "endIndex": content_end}, "textStyle": {
                    "bold": False, "italic": False, "fontSize": _pt(10),
                    "weightedFontFamily": {"fontFamily": "Arial"}, **_text_color("#374151"),
                }, "fields": "bold,italic,fontSize,weightedFontFamily,foregroundColor"}},
                {"updateParagraphStyle": {"range": {"startIndex": start, "endIndex": end}, "paragraphStyle": {
                    "spaceAbove": _pt(0), "spaceBelow": _pt(3),
                }, "fields": "spaceAbove,spaceBelow"}},
            ]

    # 4. Apply native bullet formatting to all bullet paragraphs
    bullet_ranges = [(s, e) for s, e, sg in seg_info if sg["type"] == "bullet"]
    if bullet_ranges:
        g_start, g_end = bullet_ranges[0]
        for s, e in bullet_ranges[1:]:
            if s == g_end:
                g_end = e
            else:
                requests.append({"createParagraphBullets": {
                    "range": {"startIndex": g_start, "endIndex": g_end},
                    "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
                }})
                g_start, g_end = s, e
        requests.append({"createParagraphBullets": {
            "range": {"startIndex": g_start, "endIndex": g_end},
            "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
        }})

    return requests


async def create_styled_doc_in_folder(user_id: str, title: str, markdown_text: str, folder_id: str) -> dict:
    """Create a Google Doc using the Docs API with native formatting. Returns Drive file metadata."""
    access_token = await _get_valid_access_token(user_id)

    # Step 1: Create empty doc via Docs API
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _DOCS_API,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"title": title},
            timeout=30,
        )
        resp.raise_for_status()
        doc_id = resp.json()["documentId"]

    # Step 2: Move to the CV Pilot folder
    async with httpx.AsyncClient() as client:
        meta = await client.get(
            f"{_DRIVE_FILES_URL}/{doc_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "parents"},
        )
        meta.raise_for_status()
        parents = meta.json().get("parents", [])
        move = await client.patch(
            f"{_DRIVE_FILES_URL}/{doc_id}",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            params={"addParents": folder_id, "removeParents": ",".join(parents),
                    "fields": "id,webViewLink,createdTime,modifiedTime"},
            json={},
            timeout=30,
        )
        move.raise_for_status()
        file_meta = move.json()

    # Step 3: Insert content and apply formatting in one batchUpdate
    batch_requests = _build_docs_requests(markdown_text)
    async with httpx.AsyncClient() as client:
        update = await client.post(
            f"{_DOCS_API}/{doc_id}:batchUpdate",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"requests": batch_requests},
            timeout=60,
        )
        if update.status_code != 200:
            raise RuntimeError(f"batchUpdate failed ({update.status_code}): {update.text[:1000]}")

    return {
        "id": doc_id,
        "name": title,
        "webViewLink": file_meta.get("webViewLink", f"https://docs.google.com/document/d/{doc_id}/edit"),
        "createdTime": file_meta.get("createdTime", ""),
        "modifiedTime": file_meta.get("modifiedTime", ""),
    }


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


async def export_doc_as_docx(user_id: str, doc_id: str) -> bytes:
    """Export a Google Doc as DOCX bytes using the Drive export API."""
    access_token = await _get_valid_access_token(user_id)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{doc_id}/export",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.content


async def upload_docx_as_gdoc(
    user_id: str,
    docx_bytes: bytes,
    title: str,
    folder_id: str,
) -> dict:
    """
    Upload DOCX bytes to Drive with convert=true to create a native Google Doc.
    Returns Drive file metadata dict with id, webViewLink, createdTime, modifiedTime.
    """
    access_token = await _get_valid_access_token(user_id)

    metadata = json.dumps({
        "name": title,
        "parents": [folder_id],
        "mimeType": "application/vnd.google-apps.document",
    })
    boundary = "cv_pilot_docx_boundary"
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
    ).encode("utf-8") + docx_bytes + f"\r\n--{boundary}--".encode("utf-8")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_UPLOAD_URL}?uploadType=multipart&convert=true&fields=id,name,webViewLink,createdTime,modifiedTime",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=body,
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()


async def generate_resume_docx(
    user_id: str,
    source_doc_id: Optional[str],
    source_docx_bytes: Optional[bytes],
    title: str,
    job_description: str,
    custom_instructions: str,
    folder_id: str,
    llm_client,
    llm_model: str,
) -> dict:
    """
    Full DOCX-based resume generation pipeline.

    1. Export or receive source DOCX bytes.
    2. Extract sections via docx_utils.
    3. Ask the LLM to rewrite content as structured JSON.
    4. Apply new content back to a DOCX copy (preserving styles).
    5. Upload the DOCX to Drive with convert=true to get a native Google Doc.

    Returns Drive file metadata dict.
    """
    import docx_utils
    from anthropic import AsyncAnthropic

    # Step 1: obtain DOCX bytes
    if source_docx_bytes is not None:
        docx_bytes = source_docx_bytes
    elif source_doc_id is not None:
        docx_bytes = await export_doc_as_docx(user_id, source_doc_id)
    else:
        raise ValueError("Either source_doc_id or source_docx_bytes must be provided")

    # Step 2: extract sections
    sections = docx_utils.extract_sections(docx_bytes)

    # Step 3: build LLM prompt
    system_prompt = (
        "You are a resume optimizer. Given a resume and job description, rewrite the resume "
        "content to be optimized for the job. Preserve the exact section structure of the "
        "original. Return ONLY valid JSON in this format: "
        "{\"sections\": [{\"heading\": \"<exact heading from original>\", "
        "\"content\": \"<rewritten content as plain text, use newlines for multiple items>\"}]}. "
        "Preserve all sections. Do not add or remove sections. If custom instructions mention "
        "formatting improvements, you may adjust content style but keep structure."
    )

    sections_text = ""
    for sec in sections:
        heading = sec["heading"]
        paras = "\n".join(p for p in sec["paragraphs"] if p)
        sections_text += f"\n\n### {heading}\n{paras}"

    user_message = (
        f"## Resume Sections\n{sections_text}\n\n"
        f"## Job Description\n\n{job_description}"
    )
    if custom_instructions:
        user_message += f"\n\n## Additional Instructions\n\n{custom_instructions}"

    # Step 4: call LLM (non-streaming)
    full_output = ""
    if isinstance(llm_client, AsyncAnthropic):
        response = await llm_client.messages.create(
            model=llm_model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        full_output = response.content[0].text
    else:
        # OpenAI-compatible client
        response = await llm_client.chat.completions.create(
            model=llm_model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        full_output = response.choices[0].message.content or ""

    # Step 5: parse JSON response
    try:
        cleaned = full_output.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        result_json = json.loads(cleaned)
        llm_sections = result_json.get("sections", [])
    except (json.JSONDecodeError, KeyError) as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\n\nRaw output:\n{full_output[:500]}")

    # Step 6: apply new content to DOCX
    new_docx_bytes = docx_utils.apply_sections_to_docx(docx_bytes, llm_sections)

    # Step 7: upload to Drive
    doc_data = await upload_docx_as_gdoc(user_id, new_docx_bytes, title, folder_id)
    return doc_data


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
