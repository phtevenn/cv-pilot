import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import ANTHROPIC_API_KEY
from deps import get_current_user

router = APIRouter()

_SYSTEM_PROMPT = """\
You are a professional resume coach and career advisor. Analyze the provided resume against \
the job description and give specific, actionable feedback.

Structure your response with these sections:

## Match Analysis
How well the resume aligns with the role (be concise).

## Key Improvements
Specific bullet points to strengthen or rephrase.

## Skills to Highlight
Missing or underemphasized skills the job description calls for.

## Suggested Rewrites
Rewritten versions of key bullet points or sections, ready to paste in.

Be direct, specific, and focus on impact-driven language."""

_USER_TEMPLATE = """\
## Resume

{resume}

## Job Description

{job}

Please analyze and provide tailored improvement suggestions."""


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
