"""Google Drive / Docs API helpers."""
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
from sqlmodel import Session
from database import UserGoogleToken, get_engine

async def _get_valid_access_token(user_id: str) -> str:
    """Return a valid access token, refreshing if expired."""
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        if tok is None:
            raise ValueError("No Google tokens for user — Drive not connected")
        # Check expiry
        if tok.token_expiry:
            expiry = datetime.fromisoformat(tok.token_expiry)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expiry - timedelta(minutes=5):
                # Refresh
                if not tok.refresh_token:
                    raise ValueError("Access token expired and no refresh token available")
                from auth_utils import refresh_google_access_token
                new_data = await refresh_google_access_token(tok.refresh_token)
                new_expiry = None
                if "expires_in" in new_data:
                    new_expiry = (datetime.now(timezone.utc) + timedelta(seconds=int(new_data["expires_in"]))).isoformat()
                tok.access_token = new_data["access_token"]
                tok.token_expiry = new_expiry
                session.add(tok)
                session.commit()
                return new_data["access_token"]
        return tok.access_token


async def create_google_doc_from_html(user_id: str, title: str, html_content: str) -> dict:
    """
    Create a Google Doc from HTML content using the Drive multipart upload API.
    Returns {"id": doc_id, "webViewLink": url, ...}
    """
    access_token = await _get_valid_access_token(user_id)
    import json
    metadata = json.dumps({"name": title, "mimeType": "application/vnd.google-apps.document"})
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
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=body,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


def has_drive_access(user_id: str) -> bool:
    """Check if the user has connected their Google Drive."""
    with Session(get_engine()) as session:
        tok = session.get(UserGoogleToken, user_id)
        return tok is not None and bool(tok.access_token)
