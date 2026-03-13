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


def _run_migrations(engine) -> None:
    """Apply incremental schema migrations for columns added after initial release."""
    from sqlalchemy import inspect, text

    with engine.connect() as conn:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()

        # Add resume_id to resume_versions if missing
        if "resume_versions" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("resume_versions")}
            if "resume_id" not in cols:
                conn.execute(text("ALTER TABLE resume_versions ADD COLUMN resume_id TEXT"))

        # Add active_resume_id to user_meta if missing
        if "user_meta" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("user_meta")}
            if "active_resume_id" not in cols:
                conn.execute(text("ALTER TABLE user_meta ADD COLUMN active_resume_id TEXT"))

        # Create new gdocs tables if not present (SQLModel.metadata.create_all handles new DBs;
        # this block ensures the tables exist on existing DBs before create_all runs)
        if "user_google_tokens" not in existing_tables:
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS user_google_tokens ("
                "user_id TEXT PRIMARY KEY, "
                "access_token TEXT NOT NULL, "
                "refresh_token TEXT, "
                "token_expiry TEXT"
                ")"
            ))
        if "gdoc_categories" not in existing_tables:
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS gdoc_categories ("
                "id TEXT PRIMARY KEY, "
                "user_id TEXT NOT NULL, "
                "name TEXT NOT NULL, "
                "color TEXT NOT NULL DEFAULT 'blue'"
                ")"
            ))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_gdoc_categories_user_id ON gdoc_categories (user_id)"))
        if "gdoc_resumes" not in existing_tables:
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS gdoc_resumes ("
                "id TEXT PRIMARY KEY, "
                "user_id TEXT NOT NULL, "
                "category_id TEXT, "
                "google_doc_id TEXT NOT NULL, "
                "title TEXT NOT NULL, "
                "job_description TEXT NOT NULL DEFAULT '', "
                "created_at TEXT NOT NULL, "
                "updated_at TEXT NOT NULL"
                ")"
            ))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_gdoc_resumes_user_id ON gdoc_resumes (user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_gdoc_resumes_category_id ON gdoc_resumes (category_id)"))

        conn.commit()


def create_db_and_tables() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _run_migrations(engine)


def get_session():
    with Session(get_engine()) as session:
        yield session


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------


class ResumeDoc(SQLModel, table=True):
    """A named resume container that groups multiple versions together."""

    __tablename__ = "resume_docs"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    name: str


class ResumeVersion(SQLModel, table=True):
    __tablename__ = "resume_versions"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    resume_id: Optional[str] = Field(default=None, index=True)
    name: str
    content: str = Field(default="")
    created_at: str
    updated_at: str


class UserMeta(SQLModel, table=True):
    __tablename__ = "user_meta"

    user_id: str = Field(primary_key=True)
    active_version_id: Optional[str] = Field(default=None)
    active_resume_id: Optional[str] = Field(default=None)


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


class ResumeSnapshot(SQLModel, table=True):
    __tablename__ = "resume_snapshots"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    version_id: str = Field(index=True)
    content: str = Field(default="")
    label: str = Field(default="")
    created_at: str


class UserGoogleToken(SQLModel, table=True):
    __tablename__ = "user_google_tokens"

    user_id: str = Field(primary_key=True)
    access_token: str
    refresh_token: Optional[str] = Field(default=None)
    token_expiry: Optional[str] = Field(default=None)  # ISO datetime


class GDocCategory(SQLModel, table=True):
    __tablename__ = "gdoc_categories"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    name: str
    color: str = Field(default="blue")


class GDocResume(SQLModel, table=True):
    __tablename__ = "gdoc_resumes"

    id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    category_id: Optional[str] = Field(default=None, index=True)
    google_doc_id: str
    title: str
    job_description: str = Field(default="")
    created_at: str
    updated_at: str
