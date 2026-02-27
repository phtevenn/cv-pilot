from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import FRONTEND_URL
from routes import auth, llm, pdf, resume

app = FastAPI(title="CV Pilot API", version="0.1.0")

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


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
