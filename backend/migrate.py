"""
One-time migration: read existing file-based storage (data/resumes/) and insert
into the SQLite database. Safe to run multiple times — skips already-migrated data.

Usage:
    cd backend && python migrate.py
"""
import json
import sys
from pathlib import Path

# Ensure the backend package is importable when run directly
sys.path.insert(0, str(Path(__file__).parent))

from database import Application, ResumeVersion, UserMeta, create_db_and_tables, get_engine
from config import RESUMES_DIR
from sqlmodel import Session, select


def migrate() -> None:
    create_db_and_tables()
    engine = get_engine()

    if not RESUMES_DIR.exists():
        print("No data/resumes directory found — nothing to migrate.")
        return

    migrated_users = 0
    migrated_versions = 0
    migrated_apps = 0

    for user_dir in RESUMES_DIR.iterdir():
        if not user_dir.is_dir():
            continue

        user_id = user_dir.name

        # ---- Resume versions ----
        manifest_path = user_dir / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            with Session(engine) as session:
                # Skip if already migrated
                existing = session.exec(
                    select(UserMeta).where(UserMeta.user_id == user_id)
                ).first()
                if existing is None:
                    active_id = manifest.get("active_version_id")
                    meta = UserMeta(user_id=user_id, active_version_id=active_id)
                    session.add(meta)

                for v in manifest.get("versions", []):
                    vid = v["id"]
                    existing_v = session.get(ResumeVersion, vid)
                    if existing_v is not None:
                        continue
                    content_path = user_dir / f"{vid}.md"
                    content = content_path.read_text(encoding="utf-8") if content_path.exists() else ""
                    version = ResumeVersion(
                        id=vid,
                        user_id=user_id,
                        name=v.get("name", "Unnamed"),
                        content=content,
                        created_at=v.get("created_at", ""),
                        updated_at=v.get("updated_at", ""),
                    )
                    session.add(version)
                    migrated_versions += 1

                session.commit()
            migrated_users += 1

        # ---- Applications ----
        apps_path = user_dir / "applications.json"
        if apps_path.exists():
            apps = json.loads(apps_path.read_text(encoding="utf-8"))
            with Session(engine) as session:
                for a in apps:
                    existing_a = session.get(Application, a["id"])
                    if existing_a is not None:
                        continue
                    app = Application(
                        id=a["id"],
                        user_id=user_id,
                        job_title=a.get("job_title", ""),
                        company=a.get("company", ""),
                        location=a.get("location", ""),
                        status=a.get("status", "applied"),
                        version_id=a.get("version_id"),
                        version_name=a.get("version_name"),
                        job_url=a.get("job_url", ""),
                        notes=a.get("notes", ""),
                        applied_at=a.get("applied_at", ""),
                        updated_at=a.get("updated_at", ""),
                    )
                    session.add(app)
                    migrated_apps += 1
                session.commit()

    print(f"Migration complete: {migrated_users} users, {migrated_versions} versions, {migrated_apps} applications.")


if __name__ == "__main__":
    migrate()
