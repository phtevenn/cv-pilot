import json

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from deps import get_current_user
from llm_client import get_client

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
    body = await request.json()
    resume: str = body.get("resume", "")
    messages: list[dict] = body.get("messages", [])

    # Build the full message list: resume context first, then conversation history
    full_messages = [
        {"role": "user", "content": f"Here is my current resume:\n\n{resume}"},
        {"role": "assistant", "content": "Got it — I've reviewed your resume. How can I help?"},
        *messages,
    ]

    try:
        client, model = get_client("chat")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    async def event_stream():
        if isinstance(client, AsyncAnthropic):
            async with client.messages.stream(
                model=model,
                max_tokens=4096,
                system=_SYSTEM_PROMPT,
                messages=full_messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        else:
            # OpenAI-compatible (OpenRouter / Nvidia NIM)
            # Prepend system prompt as a system message
            oai_messages = [{"role": "system", "content": _SYSTEM_PROMPT}, *full_messages]
            stream = await client.chat.completions.create(
                model=model,
                max_tokens=4096,
                messages=oai_messages,
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
