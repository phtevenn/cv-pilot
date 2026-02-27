import secrets

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

import storage
from auth_utils import (
    create_access_token,
    exchange_code_for_tokens,
    get_google_auth_url,
    get_google_user_info,
)
from config import FRONTEND_URL
from deps import get_current_user

router = APIRouter()


@router.get("/login")
async def login() -> RedirectResponse:
    state = secrets.token_urlsafe(16)
    return RedirectResponse(url=get_google_auth_url(state))


@router.get("/callback")
async def callback(
    code: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    token_data = await exchange_code_for_tokens(code)
    user_info = await get_google_user_info(token_data["access_token"])

    user_id: str = user_info["id"]
    storage.init_user(user_id)

    jwt_token = create_access_token(
        {
            "sub": user_id,
            "email": user_info.get("email", ""),
            "name": user_info.get("name", user_info.get("email", "")),
            "picture": user_info.get("picture", ""),
        }
    )
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return user
