from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import storage
from deps import get_current_user

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
