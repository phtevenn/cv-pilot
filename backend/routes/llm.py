import json

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from deps import get_current_user
from llm_client import get_client
from rate_limit import limiter

router = APIRouter()

_SCORE_TOOL = {
    "name": "score_resume",
    "description": (
        "Score how well a resume matches a job description across multiple dimensions. "
        "Return an overall percentage and per-category breakdown with notes."
    ),
    "input_schema": {
        "type": "object",
        "required": ["overall", "categories", "summary"],
        "properties": {
            "overall": {
                "type": "integer",
                "description": "Overall ATS match score from 0 to 100",
            },
            "categories": {
                "type": "object",
                "required": ["keywords", "skills", "experience", "seniority"],
                "properties": {
                    "keywords": {
                        "type": "object",
                        "required": ["score", "notes"],
                        "properties": {
                            "score": {"type": "integer", "description": "Score 0-100"},
                            "notes": {"type": "string", "description": "Brief explanation"},
                        },
                    },
                    "skills": {
                        "type": "object",
                        "required": ["score", "notes"],
                        "properties": {
                            "score": {"type": "integer", "description": "Score 0-100"},
                            "notes": {"type": "string", "description": "Brief explanation"},
                        },
                    },
                    "experience": {
                        "type": "object",
                        "required": ["score", "notes"],
                        "properties": {
                            "score": {"type": "integer", "description": "Score 0-100"},
                            "notes": {"type": "string", "description": "Brief explanation"},
                        },
                    },
                    "seniority": {
                        "type": "object",
                        "required": ["score", "notes"],
                        "properties": {
                            "score": {"type": "integer", "description": "Score 0-100"},
                            "notes": {"type": "string", "description": "Brief explanation"},
                        },
                    },
                },
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentence summary of match quality and top improvement areas",
            },
        },
    },
}

_SYSTEM_PROMPT_TEMPLATE = """\
You are a professional resume optimizer. Given a resume in Markdown format and a job description, \
rewrite the resume to better target the role.

CRITICAL RULES — follow every rule exactly:
1. OUTPUT FORMAT: Return ONLY the revised resume in Markdown. No commentary, preamble, or postamble.
2. PRESERVE ALL SECTIONS: The resume contains named sections separated by bold all-caps headings \
(e.g. **SUMMARY**, **EXPERIENCE**, **EDUCATION**, **SKILLS**). You MUST output every section that \
exists in the original, in the same order. Do not merge, remove, or rename any section.
3. SECTION HEADING FORMAT: Every section heading MUST appear on its own line as **SECTION NAME** — \
double asterisks, ALL UPPERCASE, nothing else on that line. \
Example: **WORK EXPERIENCE** not "Work Experience" or "## Experience".
4. HEADER BLOCK: The header (top of resume) contains ONLY name and contact details \
(email, phone, LinkedIn, location, etc.). Do NOT place paragraph text or a summary in the header block.
5. SUMMARY / PROFILE: If the original has a **SUMMARY** or **PROFILE** section, it MUST remain as \
its own separate section with its own **SUMMARY** heading — never fold it into the header block. \
Write the summary as 1–2 concise sentences only. No bullet points, no long paragraphs.
6. CONTENT: Strengthen bullet points with impact-driven language and keywords from the job description. \
Do not invent experience or credentials not present in the original.
7. LENGTH: The revised resume MUST fit within {page_limit} page{page_limit_plural}. \
Trim less-relevant bullet points or shorten descriptions as needed — do NOT remove entire sections."""

_USER_TEMPLATE = """\
## Resume

{resume}

## Job Description

{job}"""


@router.post("/optimize")
@limiter.limit("10/hour")
async def optimize(
    request: Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    body = await request.json()
    resume: str = body.get("resume", "")
    job: str = body.get("job_description", "")
    page_limit: int = max(1, min(int(body.get("page_limit", 1)), 5))

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        page_limit=page_limit,
        page_limit_plural="s" if page_limit > 1 else "",
    )

    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    async def event_stream():
        if isinstance(client, AsyncAnthropic):
            async with client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": _USER_TEMPLATE.format(resume=resume, job=job)}],
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        else:
            # OpenAI-compatible (OpenRouter / Nvidia NIM)
            stream = await client.chat.completions.create(
                model=model,
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": _USER_TEMPLATE.format(resume=resume, job=job)},
                ],
                stream=True,
            )
            async for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_COVER_LETTER_SYSTEM = """\
You are an expert career coach and professional writer. Given a resume and a job description, \
write a tailored, compelling cover letter for the applicant.

STYLE GUIDELINES:
- Modern, confident, and conversational — not stiff or overly formal
- Do NOT open with "I am writing to express my interest" or similar clichés
- Do NOT use hollow phrases like "I am a passionate team player"
- Open with a hook that connects the applicant's strongest relevant achievement to the role
- Show genuine understanding of what the company/role needs
- Draw specific evidence from the resume to demonstrate fit
- Close with a clear, confident call to action
- Length: 3–4 focused paragraphs — concise and impactful

OUTPUT FORMAT:
- Return only the cover letter text — no subject line, no meta-commentary
- Use plain text paragraphs separated by blank lines (no markdown headers or bullet points)\
"""

_COVER_LETTER_USER_TEMPLATE = """\
## Resume

{resume}

## Job Description

{job}

Write a tailored cover letter for this applicant."""


@router.post("/cover-letter")
@limiter.limit("10/hour")
async def cover_letter(
    request: Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    body = await request.json()
    resume: str = body.get("resume", "")
    job: str = body.get("job_description", "")

    if not resume.strip() or not job.strip():
        raise HTTPException(status_code=422, detail="resume and job_description are required")

    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    async def event_stream():
        if isinstance(client, AsyncAnthropic):
            async with client.messages.stream(
                model=model,
                max_tokens=2048,
                system=_COVER_LETTER_SYSTEM,
                messages=[{"role": "user", "content": _COVER_LETTER_USER_TEMPLATE.format(resume=resume, job=job)}],
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        else:
            stream = await client.chat.completions.create(
                model=model,
                max_tokens=2048,
                messages=[
                    {"role": "system", "content": _COVER_LETTER_SYSTEM},
                    {"role": "user", "content": _COVER_LETTER_USER_TEMPLATE.format(resume=resume, job=job)},
                ],
                stream=True,
            )
            async for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_SCORE_SYSTEM = (
    "You are an expert ATS (Applicant Tracking System) analyst. "
    "Given a resume and a job description, score how well the resume matches the role. "
    "Evaluate keyword coverage, required skills, relevant experience depth, and seniority alignment. "
    "Be honest and calibrated — scores above 85 should be rare and reflect a near-perfect match."
)


@router.post("/score")
async def score(
    request: Request,
    user: dict = Depends(get_current_user),
) -> JSONResponse:
    body = await request.json()
    resume: str = body.get("resume", "")
    job_description: str = body.get("job_description", "")

    if not resume.strip() or not job_description.strip():
        raise HTTPException(status_code=422, detail="resume and job_description are required")

    try:
        client, model = get_client("optimize")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    prompt = (
        f"## Resume\n\n{resume}\n\n"
        f"## Job Description\n\n{job_description}\n\n"
        "Use the score_resume tool to submit your ATS match evaluation."
    )

    if isinstance(client, AsyncAnthropic):
        message = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=_SCORE_SYSTEM,
            tools=[_SCORE_TOOL],
            tool_choice={"type": "tool", "name": "score_resume"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in message.content:
            if block.type == "tool_use" and block.name == "score_resume":
                return JSONResponse(content=block.input)
        raise HTTPException(status_code=500, detail="Scoring model did not return structured output")
    else:
        # Fallback for non-Anthropic clients: request JSON directly
        fallback_prompt = (
            prompt
            + "\n\nReturn a JSON object only with this exact shape:\n"
            '{"overall": <0-100>, "categories": {"keywords": {"score": <0-100>, "notes": "..."}, '
            '"skills": {"score": <0-100>, "notes": "..."}, '
            '"experience": {"score": <0-100>, "notes": "..."}, '
            '"seniority": {"score": <0-100>, "notes": "..."}}, "summary": "..."}'
        )
        response = await client.chat.completions.create(
            model=model,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": _SCORE_SYSTEM},
                {"role": "user", "content": fallback_prompt},
            ],
        )
        text = response.choices[0].message.content or "{}"
        # Strip markdown code fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        try:
            return JSONResponse(content=json.loads(text))
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="Failed to parse scoring response")
