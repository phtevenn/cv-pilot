# CV Pilot

AI-powered resume optimizer — edit your resume in a block-based Markdown editor, chat with an AI coach, optimize for job descriptions, search for matching jobs, track applications, and export to PDF.

## Features

- **Block editor** — resume broken into sections (header, summary, experience, etc.); each section editable independently
- **AI optimizer** — paste a job description and receive a structured diff of suggested changes; accept or decline each section individually
- **AI chat coach** — ask questions, request targeted edits, and get real-time feedback; chat agent can search the web and fetch public URLs (including GitHub repos)
- **Job search** — search by multiple job titles and location; results cached locally with 24-hour auto-refresh
- **Application tracker** — track jobs you've applied to, link them to your resume, and monitor status
- **PDF export** — clean, print-styled PDF via Playwright/Chromium
- **Google OAuth** — sign in with Google; resume persisted per user

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Editor | Block-based Markdown editor (CodeMirror 6) |
| Preview | react-markdown |
| Backend | FastAPI (Python 3.11+) |
| Auth | Google OAuth2 + JWT |
| PDF | Playwright (Chromium) |
| LLM | Anthropic Claude API (streaming SSE) |
| Web search | Anthropic web-search beta tool |
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

uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -e .

# Install Playwright's Chromium browser (one-time)
playwright install chromium

uvicorn main:app --reload --port 8000
```

API available at `http://localhost:8000`. Interactive docs: `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend

npm install

cp .env.example .env.local   # uses default localhost:8000 backend

npm run dev
```

Open `http://localhost:5173`.

---

## Usage

### Resume Editor

- Edit your resume in the block editor (left pane); live preview on the right
- Click **✦ Optimize with AI** → paste a job description → review suggested section changes, accept/decline each one individually
- Click **✦ Resume AI** to open the chat panel — ask questions, request specific edits, or paste a URL (e.g. a GitHub repo or job posting) for the AI to read
- Click **Export PDF** to download a professionally styled PDF

### Find Jobs

- Enter one or more job titles and a location
- Results are cached locally for 24 hours and auto-refresh; manually refresh any time
- Click **Track** on any job card to add it to your application tracker

### Applications

- View all tracked job applications with status (Applied, Interviewing, Offer, Rejected, Closed)
- Open the associated job in a new tab or remove from tracker

---

## Project structure

```
cv-pilot/
├── backend/
│   ├── pyproject.toml          # uv / PEP 517 project
│   ├── main.py                 # FastAPI app + CORS
│   ├── config.py               # Env-var config
│   ├── auth_utils.py           # Google OAuth + JWT helpers
│   ├── deps.py                 # FastAPI auth dependency
│   ├── storage.py              # File-based resume persistence
│   ├── llm_client.py           # LLM provider abstraction (Anthropic / OpenAI-compat)
│   └── routes/
│       ├── auth.py             # /api/auth/*
│       ├── resume.py           # /api/resume
│       ├── pdf.py              # /api/export/pdf
│       ├── llm.py              # /api/llm/optimize (streaming)
│       ├── chat.py             # /api/chat (streaming, web search + fetch_url)
│       └── jobs.py             # /api/jobs/search
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── api/client.ts           # Typed fetch wrapper
    │   ├── context/AuthContext.tsx
    │   ├── types/blocks.ts         # ResumeBlock types
    │   ├── utils/
    │   │   ├── blocks.ts           # Block serialization, migration, patch apply
    │   │   ├── blockDiff.ts        # Per-block diff computation
    │   │   └── diff.ts             # Line-level diff (Myers)
    │   ├── pages/
    │   │   ├── LoginPage.tsx
    │   │   ├── EditorPage.tsx      # Main editor + diff review
    │   │   ├── JobsPage.tsx        # Job search + caching
    │   │   └── ApplicationsPage.tsx
    │   └── components/
    │       ├── NavBar.tsx
    │       ├── BlockEditor.tsx
    │       ├── BlockDiffView.tsx    # Accept/decline diff UI
    │       ├── ChatPanel.tsx        # AI chat coach
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
| `POST` | `/api/llm/optimize` | Bearer | Stream AI resume optimization |
| `POST` | `/api/chat` | Bearer | Stream AI chat (web search + fetch_url) |
| `POST` | `/api/jobs/search` | Bearer | Search jobs by title(s) and location |
| `GET` | `/api/health` | — | Health check |
