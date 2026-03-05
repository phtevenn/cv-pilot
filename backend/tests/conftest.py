import sys
from pathlib import Path

# Make the backend package importable from tests/
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine

import auth_utils
import database
from main import app


@pytest.fixture()
def tmp_storage(tmp_path, monkeypatch):
    """Redirect all DB I/O to a fresh SQLite database in a temp directory."""
    db_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(database, "_engine", engine)
    yield engine
    engine.dispose()


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
