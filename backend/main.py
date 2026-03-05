from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from config import FRONTEND_URL
from rate_limit import limiter
from routes import applications, auth, chat, jobs, llm, pdf, resume

app = FastAPI(title="CV Pilot API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(resume.router, prefix="/api/resume", tags=["resume"])
app.include_router(pdf.router, prefix="/api/export", tags=["export"])
app.include_router(llm.router, prefix="/api/llm", tags=["llm"])
app.include_router(chat.router, prefix="/api/llm", tags=["llm"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["applications"])


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
