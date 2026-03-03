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
JSEARCH_API_KEY: str = os.getenv("JSEARCH_API_KEY", "")
RAPIDAPI_HOST: str = "jsearch.p.rapidapi.com"
# Number of job recommendations returned (1–25; override via RECO_LIMIT env var)
RECO_LIMIT: int = max(1, min(25, int(os.getenv("RECO_LIMIT", "10"))))

# Per-task provider config
SCORE_PROVIDER: str = os.getenv("SCORE_PROVIDER", "anthropic")
SCORE_MODEL: str = os.getenv("SCORE_MODEL", "claude-haiku-4-5-20251001")

CHAT_PROVIDER: str = os.getenv("CHAT_PROVIDER", "anthropic")
CHAT_MODEL: str = os.getenv("CHAT_MODEL", "claude-sonnet-4-6")

OPTIMIZE_PROVIDER: str = os.getenv("OPTIMIZE_PROVIDER", "anthropic")
OPTIMIZE_MODEL: str = os.getenv("OPTIMIZE_MODEL", "claude-sonnet-4-6")

# Alternative provider credentials
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

NVIDIA_NIM_API_KEY: str = os.getenv("NVIDIA_NIM_API_KEY", "")
NVIDIA_NIM_BASE_URL: str = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")

DATA_DIR = Path(__file__).parent / "data"
RESUMES_DIR = DATA_DIR / "resumes"

RESUMES_DIR.mkdir(parents=True, exist_ok=True)
