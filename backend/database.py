"""SQLModel database setup and table definitions."""

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine

from config import DATA_DIR

_DB_PATH = DATA_DIR / "cv_pilot.db"
_engine: Optional[object] = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
    return _engine


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------


class ResumeVersion(SQLModel, table=True):
    __tablename__ = "resume_versions"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    name: str
    content: str = Field(default="")
    created_at: str
    updated_at: str


class UserMeta(SQLModel, table=True):
    __tablename__ = "user_meta"

    user_id: str = Field(primary_key=True)
    active_version_id: Optional[str] = Field(default=None)


class Application(SQLModel, table=True):
    __tablename__ = "applications"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    job_title: str = Field(default="")
    company: str = Field(default="")
    location: str = Field(default="")
    status: str = Field(default="applied")
    version_id: Optional[str] = Field(default=None)
    version_name: Optional[str] = Field(default=None)
    job_url: str = Field(default="")
    notes: str = Field(default="")
    applied_at: str
    updated_at: str
