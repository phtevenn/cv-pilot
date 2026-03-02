import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from config import ANTHROPIC_API_KEY
from deps import get_current_user

router = APIRouter()

_SYSTEM_PROMPT = """\
You are an expert resume coach. The user's current resume is provided at the start of the conversation.
Answer questions, give targeted advice, and help improve the resume.
When asked to make edits, return the FULL revised resume inside a ```markdown code block.
Never invent experience or credentials not in the original resume."""


@router.post("/chat")
async def chat(
    request: Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    body = await request.json()
    resume: str = body.get("resume", "")
    messages: list[dict] = body.get("messages", [])

    # Build the full message list: resume context first, then conversation history
    full_messages = [
        {"role": "user", "content": f"Here is my current resume:\n\n{resume}"},
        {"role": "assistant", "content": "Got it — I've reviewed your resume. How can I help?"},
        *messages,
    ]

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    async def event_stream():
        async with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=full_messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
