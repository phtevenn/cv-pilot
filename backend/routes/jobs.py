import json
import re
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import ANTHROPIC_API_KEY, JSEARCH_API_KEY, RAPIDAPI_HOST
from deps import get_current_user
import storage

router = APIRouter()

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "about", "into", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "not", "no", "so",
    "yet", "each", "more", "most", "other", "some", "such", "than", "too",
    "very", "just", "as", "this", "that", "these", "those", "it", "its",
    "you", "your", "we", "our", "they", "their", "he", "she", "his", "her",
    "i", "my", "me", "us",
}


class SearchRequest(BaseModel):
    job_titles: str
    location: str = ""
    remote_only: bool = False


def _extract_keywords(text: str) -> set[str]:
    words = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{2,}\b", text.lower())
    return {w for w in words if w not in _STOPWORDS}


def _keyword_score(resume_kw: set[str], job_text: str) -> int:
    job_kw = _extract_keywords(job_text)
    return len(resume_kw & job_kw)


def _format_salary(raw: dict) -> Optional[str]:
    min_s = raw.get("job_min_salary")
    max_s = raw.get("job_max_salary")
    period = raw.get("job_salary_period", "")
    if min_s and max_s:
        return f"${int(min_s):,}–${int(max_s):,} {period}".strip()
    if min_s:
        return f"${int(min_s):,}+ {period}".strip()
    return None


def _normalize_job(raw: dict) -> dict:
    city = raw.get("job_city") or ""
    state = raw.get("job_state") or ""
    location = f"{city}, {state}".strip(", ") if city or state else ""
    return {
        "id": raw.get("job_id", ""),
        "title": raw.get("job_title", ""),
        "company": raw.get("employer_name", ""),
        "location": location,
        "salary": _format_salary(raw),
        "description": (raw.get("job_description") or "")[:5000],
        "apply_url": raw.get("job_apply_link", ""),
        "source": raw.get("job_publisher", ""),
        "posted_at": raw.get("job_posted_at_datetime_utc", ""),
        "match_score": 50,
        "match_reason": "",
    }


async def _fetch_jobs(query: str, location: str, remote_only: bool) -> list[dict]:
    if not JSEARCH_API_KEY:
        raise HTTPException(status_code=503, detail="JSEARCH_API_KEY not configured")
    params: dict = {
        "query": f"{query} in {location}" if location else query,
        "num_pages": "1",
        "date_posted": "month",
    }
    if remote_only:
        params["remote_jobs_only"] = "true"
    headers = {
        "X-RapidAPI-Key": JSEARCH_API_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://{RAPIDAPI_HOST}/search",
            params=params,
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"JSearch API error: {resp.status_code}")
    return resp.json().get("data", [])


async def _rerank_with_claude(resume: str, jobs: list[dict]) -> list[dict]:
    if not ANTHROPIC_API_KEY:
        for i, j in enumerate(jobs):
            j["match_score"] = max(80 - i * 5, 10)
            j["match_reason"] = "Ranked by keyword overlap"
        return jobs

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    job_summaries = [
        {
            "id": j["id"],
            "title": j["title"],
            "company": j["company"],
            "description": j["description"][:500],
        }
        for j in jobs
    ]
    prompt = (
        "Given the following resume and job listings, rate each job's relevance "
        "to the candidate's background (0-100) and provide a concise one-sentence reason.\n\n"
        f"Resume (excerpt):\n{resume[:2000]}\n\n"
        f"Jobs:\n{json.dumps(job_summaries, indent=2)}\n\n"
        'Return a JSON array only, no other text:\n'
        '[{"id": "<job_id>", "score": <0-100>, "reason": "<one sentence>"}]'
    )
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text if message.content else "[]"
    json_match = re.search(r"\[.*\]", text, re.DOTALL)
    if not json_match:
        return jobs
    try:
        rankings = json.loads(json_match.group())
    except json.JSONDecodeError:
        return jobs

    score_map = {r["id"]: (r.get("score", 50), r.get("reason", "")) for r in rankings if "id" in r}
    for job in jobs:
        if job["id"] in score_map:
            job["match_score"], job["match_reason"] = score_map[job["id"]]
    return jobs


@router.post("/search")
async def search_jobs(
    body: SearchRequest,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id: str = user["sub"]
    resume = storage.load_resume(user_id)
    resume_keywords = _extract_keywords(resume)

    raw_jobs = await _fetch_jobs(body.job_titles, body.location, body.remote_only)
    if not raw_jobs:
        return []

    scored_raw = sorted(
        raw_jobs,
        key=lambda j: _keyword_score(
            resume_keywords,
            (j.get("job_description") or "") + " " + (j.get("job_title") or ""),
        ),
        reverse=True,
    )
    top15 = [_normalize_job(j) for j in scored_raw[:15]]
    reranked = await _rerank_with_claude(resume, top15)
    reranked.sort(key=lambda j: j["match_score"], reverse=True)
    return reranked[:10]
