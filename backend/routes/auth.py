import secrets

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse

import storage
from auth_utils import (
    create_access_token,
    exchange_code_for_tokens,
    get_google_auth_url,
    get_google_user_info,
)
from config import BACKEND_URL, FRONTEND_URL
from deps import get_current_user

router = APIRouter()


def _public_base(request: Request) -> str:
    """Derive the public-facing base URL from the incoming request.

    When running behind nginx (Docker), nginx forwards the original Host header
    (including port) and X-Forwarded-Proto, so this returns the URL the browser
    actually used — whether that's localhost, a tailnet hostname, or a domain.
    """
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}"


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    backend_base = BACKEND_URL or _public_base(request)
    redirect_uri = f"{backend_base}/api/auth/callback"
    state = secrets.token_urlsafe(16)
    return RedirectResponse(url=get_google_auth_url(state, redirect_uri))


@router.get("/callback")
async def callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
) -> RedirectResponse:
    backend_base = BACKEND_URL or _public_base(request)
    redirect_uri = f"{backend_base}/api/auth/callback"

    token_data = await exchange_code_for_tokens(code, redirect_uri)
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
    # FRONTEND_URL is only needed when the frontend is on a different origin
    # than the backend (local dev: backend=:8000, frontend=:5173).
    # In Docker the nginx proxy serves both from the same origin, so we can
    # derive the frontend URL from the request instead.
    frontend_base = FRONTEND_URL if FRONTEND_URL else public_base
    return RedirectResponse(url=f"{frontend_base}/auth/callback?token={jwt_token}")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return user
