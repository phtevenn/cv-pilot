import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import ANTHROPIC_API_KEY
from deps import get_current_user

router = APIRouter()

_SYSTEM_PROMPT = """\
You are a professional resume optimizer. Given a resume in Markdown format and a job description, \
rewrite the resume to better target the role.

CRITICAL RULES:
- Return ONLY the revised resume in Markdown format.
- No commentary, no explanations, no preamble, no postamble.
- Preserve the exact same Markdown structure and formatting conventions.
- Strengthen bullet points with impact-driven language and relevant keywords from the job description.
- Do not invent experience or credentials that are not in the original resume."""

_USER_TEMPLATE = """\
## Resume

{resume}

## Job Description

{job}"""


@router.post("/optimize")
async def optimize(
    request: Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    body = await request.json()
    resume: str = body.get("resume", "")
    job: str = body.get("job_description", "")

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    async def event_stream():
        async with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": _USER_TEMPLATE.format(resume=resume, job=job),
                }
            ],
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
