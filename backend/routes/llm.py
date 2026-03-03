import json

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from deps import get_current_user
from llm_client import get_client

router = APIRouter()

_SYSTEM_PROMPT_TEMPLATE = """\
You are a professional resume optimizer. Given a resume in Markdown format and a job description, \
rewrite the resume to better target the role.

CRITICAL RULES:
- Return ONLY the revised resume in Markdown format.
- No commentary, no explanations, no preamble, no postamble.
- Preserve the exact same Markdown structure and formatting conventions.
- Strengthen bullet points with impact-driven language and relevant keywords from the job description.
- Do not invent experience or credentials that are not in the original resume.
- The revised resume MUST fit within {page_limit} page{page_limit_plural}. \
Trim less-relevant bullet points, shorten descriptions, or consolidate sections as needed to stay within the limit."""

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
