from fastapi import APIRouter, Depends
from pydantic import BaseModel

import storage
from deps import get_current_user

router = APIRouter()


class ResumeUpdate(BaseModel):
    content: str


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
