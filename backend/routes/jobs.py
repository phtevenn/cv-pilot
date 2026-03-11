import json
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from anthropic import AsyncAnthropic

from config import JSEARCH_API_KEY, RAPIDAPI_HOST, RECO_LIMIT
from deps import get_current_user
from llm_client import get_client
from rate_limit import limiter
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


_RECO_MAX: int = 25  # hard upper cap regardless of config or request


class SearchRequest(BaseModel):
    job_titles: List[str]
    location: str = ""
    remote_only: bool = False
    # 0 means "use server default (RECO_LIMIT)"; 1–25 to request a specific count
    limit: int = Field(default=0, ge=0, le=_RECO_MAX)


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


async def _fetch_jobs(query: str, location: str, remote_only: bool, pages: int = 1) -> list[dict]:
    if not JSEARCH_API_KEY:
        raise HTTPException(status_code=503, detail="JSEARCH_API_KEY not configured")
    params: dict = {
        "query": f"{query} in {location}" if location else query,
        "num_pages": str(max(1, min(pages, 5))),  # guard: 1–5 pages
        "date_posted": "month",
    }
    if remote_only:
        params["remote_jobs_only"] = "true"
    headers = {
        "X-RapidAPI-Key": JSEARCH_API_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    async with httpx.AsyncClient(timeout=max(15.0, pages * 8.0)) as client:
        resp = await client.get(
            f"https://{RAPIDAPI_HOST}/search",
            params=params,
            headers=headers,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"JSearch API error: {resp.status_code}")
    return resp.json().get("data", [])


async def _fetch_jobs_page(query: str, location: str, remote_only: bool, page: int) -> list[dict]:
    """Fetch a single page from JSearch."""
    if not JSEARCH_API_KEY:
        raise HTTPException(status_code=503, detail="JSEARCH_API_KEY not configured")
    params: dict = {
        "query": f"{query} in {location}" if location else query,
        "page": str(page),
        "num_pages": "1",
        "date_posted": "month",
    }
    if remote_only:
        params["remote_jobs_only"] = "true"
    headers = {
        "X-RapidAPI-Key": JSEARCH_API_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"https://{RAPIDAPI_HOST}/search",
            params=params,
            headers=headers,
        )
    if resp.status_code != 200:
        return []
    return resp.json().get("data", [])


_RERANK_TOOL = {
    "name": "rerank",
    "description": (
        "Submit relevance rankings for each job listing based on the candidate's resume. "
        "Assign a score from 0 to 100 and a one-sentence reason for each job."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "rankings": {
                "type": "array",
                "description": "List of job rankings",
                "items": {
                    "type": "object",
                    "properties": {
                        "job_id": {
                            "type": "string",
                            "description": "The job's unique identifier",
                        },
                        "score": {
                            "type": "number",
                            "description": "Relevance score from 0 to 100",
                        },
                        "reason": {
                            "type": "string",
                            "description": "One-sentence explanation of the score",
                        },
                    },
                    "required": ["job_id", "score", "reason"],
                },
            }
        },
        "required": ["rankings"],
    },
}


async def _rerank_with_claude(resume: str, jobs: list[dict]) -> list[dict]:
    try:
        client, model = get_client("score")
    except ValueError:
        for i, j in enumerate(jobs):
            j["match_score"] = max(80 - i * 5, 10)
            j["match_reason"] = "Ranked by keyword overlap"
        return jobs

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
        "Use the rerank tool to submit your rankings for every job listed above."
    )

    rankings: list[dict] = []

    if isinstance(client, AsyncAnthropic):
        message = await client.messages.create(
            model=model,
            max_tokens=1024,
            tools=[_RERANK_TOOL],
            tool_choice={"type": "tool", "name": "rerank"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in message.content:
            if block.type == "tool_use" and block.name == "rerank":
                rankings = block.input.get("rankings", [])
                break
    else:
        # Fallback for non-Anthropic clients: ask for JSON and parse it
        fallback_prompt = (
            prompt
            + '\nReturn a JSON array only, no other text:\n'
            '[{"id": "<job_id>", "score": <0-100>, "reason": "<one sentence>"}]'
        )
        response = await client.chat.completions.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": fallback_prompt}],
        )
        text = response.choices[0].message.content or "[]"
        json_match = re.search(r"\[.*\]", text, re.DOTALL)
        if json_match:
            try:
                raw = json.loads(json_match.group())
                rankings = [
                    {"job_id": r["id"], "score": r.get("score", 50), "reason": r.get("reason", "")}
                    for r in raw
                    if "id" in r
                ]
            except (json.JSONDecodeError, KeyError):
                pass

    score_map = {r["job_id"]: (r.get("score", 50), r.get("reason", "")) for r in rankings if "job_id" in r}
    for job in jobs:
        if job["id"] in score_map:
            job["match_score"], job["match_reason"] = score_map[job["id"]]
    return jobs


@router.post("/search")
@limiter.limit("20/hour")
async def search_jobs(
    request: Request,
    body: SearchRequest,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id: str = user["sub"]
    resume = storage.load_resume(user_id)
    resume_keywords = _extract_keywords(resume)

    # Resolve the result count: per-request limit takes precedence over server default
    effective_limit = body.limit if 1 <= body.limit <= _RECO_MAX else RECO_LIMIT
    # Fetch 2× as many candidates so reranking has room to surface better matches.
    # Each JSearch page yields ~10 results; cap at 5 pages (≤50 raw results).
    pool_size = min(effective_limit * 2, 50)
    pages_needed = max(1, min((pool_size + 9) // 10, 5))

    if len(body.job_titles) > 1:
        query = f"({' OR '.join(body.job_titles)})"
    else:
        query = body.job_titles[0] if body.job_titles else ""
    raw_jobs = await _fetch_jobs(query, body.location, body.remote_only, pages=pages_needed)
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
    candidates = [_normalize_job(j) for j in scored_raw[:pool_size]]
    reranked = await _rerank_with_claude(resume, candidates)
    reranked.sort(key=lambda j: j["match_score"], reverse=True)
    return reranked[:effective_limit]


@router.post("/search-stream")
@limiter.limit("20/hour")
async def search_jobs_stream(
    request: Request,
    body: SearchRequest,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    user_id: str = user["sub"]
    resume = storage.load_resume(user_id)
    resume_keywords = _extract_keywords(resume)

    effective_limit = body.limit if 1 <= body.limit <= _RECO_MAX else RECO_LIMIT
    pool_size = min(effective_limit * 2, 50)
    pages_needed = max(1, min((pool_size + 9) // 10, 5))

    if len(body.job_titles) > 1:
        query = f"({' OR '.join(body.job_titles)})"
    else:
        query = body.job_titles[0] if body.job_titles else ""

    async def generate():
        all_raw_jobs: list[dict] = []

        for page in range(1, pages_needed + 1):
            try:
                page_jobs = await _fetch_jobs_page(query, body.location, body.remote_only, page)
            except Exception:
                page_jobs = []
            if page_jobs:
                all_raw_jobs.extend(page_jobs)
            count = len(all_raw_jobs)
            if pages_needed > 1:
                msg = f"Found {count} listing{'s' if count != 1 else ''}… (page {page}/{pages_needed})"
            else:
                msg = f"Found {count} listing{'s' if count != 1 else ''}…"
            yield f"data: {json.dumps({'type': 'progress', 'message': msg})}\n\n"

        if not all_raw_jobs:
            yield 'data: {"type": "done"}\n\n'
            return

        yield f"data: {json.dumps({'type': 'progress', 'message': 'Ranking with AI…'})}\n\n"

        sorted_raw = sorted(
            all_raw_jobs,
            key=lambda j: _keyword_score(
                resume_keywords,
                (j.get("job_description") or "") + " " + (j.get("job_title") or ""),
            ),
            reverse=True,
        )
        candidates = [_normalize_job(j) for j in sorted_raw[:pool_size]]
        reranked = await _rerank_with_claude(resume, candidates)
        reranked.sort(key=lambda j: j["match_score"], reverse=True)
        yield f"data: {json.dumps({'type': 'reranked', 'jobs': reranked[:effective_limit]})}\n\n"
        yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
