# CV Pilot

AI-powered resume optimizer — edit markdown, preview live, optimize for job descriptions with Claude, and export to PDF.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Editor | CodeMirror 6 |
| Preview | react-markdown |
| Backend | FastAPI (Python 3.11+) |
| Auth | Google OAuth2 + JWT |
| PDF | Playwright (Chromium) |
| LLM | Anthropic Claude API (streaming) |
| Package manager | `uv` (Python) / `npm` (Node) |

---

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (`pip install uv` or `curl -Ls https://astral.sh/uv/install.sh | sh`)
- Node 18+
- A [Google Cloud project](https://console.cloud.google.com) with an OAuth 2.0 client
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

### 1. Clone & configure environment

```bash
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY, SECRET_KEY
```

### 2. Google OAuth setup

In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

1. Create an **OAuth 2.0 Client ID** (Web application)
2. Add `http://localhost:8000/api/auth/callback` as an **Authorized redirect URI**
3. Copy the Client ID and Secret into your `.env`

### 3. Backend

```bash
cd backend

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -e .

# Install Playwright's Chromium browser (one-time)
playwright install chromium

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend

npm install

# Copy env (uses default localhost:8000 backend)
cp .env.example .env.local

npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Usage

1. **Sign in** with your Google account
2. **Edit** your resume in the left pane (Markdown); the right pane previews it live
3. Click **✦ Optimize with AI** → paste a job description → receive tailored suggestions
4. Click **Export PDF** to download a professionally styled PDF

---

## Project structure

```
cv-pilot/
├── backend/
│   ├── pyproject.toml      # uv / PEP 517 project
│   ├── main.py             # FastAPI app + CORS
│   ├── config.py           # Env-var config
│   ├── auth_utils.py       # Google OAuth + JWT helpers
│   ├── deps.py             # FastAPI auth dependency
│   ├── storage.py          # File-based resume persistence
│   └── routes/
│       ├── auth.py         # /api/auth/*
│       ├── resume.py       # /api/resume
│       ├── pdf.py          # /api/export/pdf
│       └── llm.py          # /api/llm/optimize (streaming)
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── api/client.ts       # Typed fetch wrapper
    │   ├── context/AuthContext.tsx
    │   ├── pages/
    │   │   ├── LoginPage.tsx
    │   │   └── EditorPage.tsx
    │   └── components/
    │       ├── Toolbar.tsx
    │       └── OptimizeModal.tsx
    ├── tailwind.config.cjs
    └── vite.config.ts
```

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/auth/login` | — | Redirect to Google OAuth |
| `GET` | `/api/auth/callback` | — | OAuth callback, sets JWT |
| `GET` | `/api/auth/me` | Bearer | Current user info |
| `GET` | `/api/resume` | Bearer | Load resume markdown |
| `PUT` | `/api/resume` | Bearer | Save resume markdown |
| `POST` | `/api/export/pdf` | Bearer | Render resume to PDF |
| `POST` | `/api/llm/optimize` | Bearer | Stream AI suggestions |
| `GET` | `/api/health` | — | Health check |
