import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (parent of backend/)
load_dotenv(Path(__file__).parent.parent / ".env")

GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")

DATA_DIR = Path(__file__).parent / "data"
RESUMES_DIR = DATA_DIR / "resumes"

RESUMES_DIR.mkdir(parents=True, exist_ok=True)
