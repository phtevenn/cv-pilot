import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv


def _get_pass(pass_path: str) -> str | None:
    """Retrieve a secret from the pass store. Returns None if unavailable."""
    try:
        result = subprocess.run(
            ["pass", "show", pass_path],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _env_file_keys(env_path) -> set:
    """Return variable names explicitly set in a .env file."""
    keys = set()
    try:
        with open(env_path) as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    keys.add(line.split("=", 1)[0].strip())
    except FileNotFoundError:
        pass
    return keys


def _load_from_pass(mapping, env_file) -> None:
    """Seed os.environ with secrets from pass.

    Only loads a key if absent from both system environment and the .env file,
    so that: system env > .env > pass
    """
    defined_in_file = _env_file_keys(env_file)
    for env_var, pass_path in mapping.items():
        if env_var in os.environ or env_var in defined_in_file:
            continue
        val = _get_pass(pass_path)
        if val is not None:
            os.environ[env_var] = val


_DOTENV_PATH = Path(__file__).parent.parent / ".env"
_load_from_pass(
    {
        "ANTHROPIC_API_KEY":    "api/ANTHROPIC",
        "GOOGLE_CLIENT_ID":     "oauth/GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET": "oauth/GOOGLE_CLIENT_SECRET",
        "SECRET_KEY":           "cv-pilot/SECRET_KEY",
        "JSEARCH_API_KEY":      "api/JSEARCH",
    },
    _DOTENV_PATH,
)

# Load .env from project root (parent of backend/)
load_dotenv(_DOTENV_PATH)

GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
# Leave empty to derive redirect URLs from the incoming request (works for any
# hostname including tailnet). Set explicitly only when the frontend and backend
# are on different origins (e.g. local dev: frontend=:5173, backend=:8000).
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")
BACKEND_URL: str = os.getenv("BACKEND_URL", "")
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
