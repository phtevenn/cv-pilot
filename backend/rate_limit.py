"""Rate limiter instance shared across the application."""
from slowapi import Limiter


def _get_user_id(request) -> str:  # type: ignore[type-arg]
    """Extract JWT sub claim as rate limit key; fall back to client IP."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            from jose import jwt as jose_jwt
            payload = jose_jwt.get_unverified_claims(token)
            sub = payload.get("sub")
            if sub:
                return str(sub)
        except Exception:
            pass
    return request.client.host if request.client else "anonymous"


limiter = Limiter(key_func=_get_user_id)
