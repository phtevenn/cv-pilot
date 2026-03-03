from datetime import datetime, timezone

import pytest
from jose import JWTError

import auth_utils


def test_create_and_decode_token():
    token = auth_utils.create_access_token(
        {"sub": "user-abc", "email": "user@example.com"}
    )
    payload = auth_utils.decode_access_token(token)
    assert payload["sub"] == "user-abc"
    assert payload["email"] == "user@example.com"
    assert "exp" in payload


def test_decode_invalid_token_raises():
    with pytest.raises(JWTError):
        auth_utils.decode_access_token("not.a.valid.token")


def test_token_expiry_is_roughly_30_days():
    token = auth_utils.create_access_token({"sub": "u1"})
    payload = auth_utils.decode_access_token(token)
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    delta = exp - datetime.now(timezone.utc)
    assert delta.days >= 29


def test_sub_is_preserved_verbatim():
    token = auth_utils.create_access_token({"sub": "google|12345"})
    payload = auth_utils.decode_access_token(token)
    assert payload["sub"] == "google|12345"
