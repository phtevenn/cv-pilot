import sys
from pathlib import Path

# Make the backend package importable from tests/
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient

import auth_utils
import storage
from main import app


@pytest.fixture()
def tmp_storage(tmp_path, monkeypatch):
    """Redirect all storage I/O to a fresh temporary directory."""
    monkeypatch.setattr(storage, "RESUMES_DIR", tmp_path)
    return tmp_path


@pytest.fixture()
def client(tmp_storage):
    return TestClient(app)


@pytest.fixture()
def auth_token():
    return auth_utils.create_access_token(
        {"sub": "test-user-123", "email": "test@example.com"}
    )


@pytest.fixture()
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
