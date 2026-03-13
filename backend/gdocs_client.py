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
