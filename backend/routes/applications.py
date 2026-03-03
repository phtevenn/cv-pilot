from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import storage
from deps import get_current_user

router = APIRouter()


class ApplicationStatus(str, Enum):
    applied = "applied"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"
    withdrawn = "withdrawn"


class ApplicationCreate(BaseModel):
    job_title: str
    company: str
    location: str = ""
    status: ApplicationStatus = ApplicationStatus.applied
    version_id: Optional[str] = None
    version_name: Optional[str] = None
    job_url: str = ""
    notes: str = ""


class ApplicationUpdate(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    status: Optional[ApplicationStatus] = None
    version_id: Optional[str] = None
    version_name: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_applications(user: dict = Depends(get_current_user)) -> list:
    return storage.list_applications(user["sub"])


@router.post("")
async def create_application(
    body: ApplicationCreate,
    user: dict = Depends(get_current_user),
) -> dict:
    return storage.create_application(user["sub"], body.model_dump())


@router.get("/{app_id}")
async def get_application(
    app_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    app = storage.get_application(user["sub"], app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.put("/{app_id}")
async def update_application(
    app_id: str,
    body: ApplicationUpdate,
    user: dict = Depends(get_current_user),
) -> dict:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    app = storage.update_application(user["sub"], app_id, data)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.delete("/{app_id}")
async def delete_application(
    app_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    ok = storage.delete_application(user["sub"], app_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"ok": True}
