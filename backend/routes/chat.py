import json
import re

import httpx
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from deps import get_current_user
from llm_client import get_client
from rate_limit import limiter

router = APIRouter()

# ---------------------------------------------------------------------------
# fetch_url tool — client-side tool for reading public URLs / GitHub files
# ---------------------------------------------------------------------------

_MAX_FETCH_CHARS = 12_000
_GITHUB_BLOB_RE = re.compile(r"https://github\.com/([^/]+/[^/]+)/blob/(.+)")


async def _fetch_url(url: str) -> str:
    """Fetch a public URL and return up to _MAX_FETCH_CHARS of its text."""
    # Convert GitHub blob URLs → raw.githubusercontent.com
    blob_match = _GITHUB_BLOB_RE.match(url)
    if blob_match:
        url = f"https://raw.githubusercontent.com/{blob_match.group(1)}/{blob_match.group(2)}"

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as http:
            resp = await http.get(url, headers={"User-Agent": "cv-pilot/1.0"})
            resp.raise_for_status()
            text = resp.text
            if len(text) > _MAX_FETCH_CHARS:
                text = text[:_MAX_FETCH_CHARS] + f"\n\n[... truncated at {_MAX_FETCH_CHARS} chars ...]"
            return text
    except httpx.HTTPStatusError as exc:
        return f"HTTP {exc.response.status_code} error fetching {url}"
    except Exception as exc:
        return f"Error fetching {url}: {exc}"


_FETCH_TOOL = {
    "name": "fetch_url",
    "description": (
        "Fetch the full text content of any public URL — GitHub files, documentation, job postings, etc. "
        "For GitHub source files prefer the raw URL format: "
        "https://raw.githubusercontent.com/{user}/{repo}/{branch}/{path}. "
        "GitHub blob URLs (github.com/.../blob/...) are converted automatically."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "The public URL to fetch."}
        },
        "required": ["url"],
    },
}

_CHAT_TOOLS = [{"type": "web_search_20250305", "name": "web_search"}, _FETCH_TOOL]
_CHAT_BETAS = ["web-search-2025-03-05"]

_SYSTEM_PROMPT = """\
You are an expert resume coach. The user's current resume is provided at the start of the conversation.
Answer questions, give targeted advice, and help improve the resume.
Never invent experience or credentials not in the original resume.
You have access to web search — use it when the user asks about current job market trends, \
required skills for a role, salary ranges, or anything else that benefits from up-to-date information.
You also have a fetch_url tool — use it to read the full contents of any public URL the user shares, \
including GitHub repositories, raw source files, documentation pages, and job postings.

When making edits, choose the appropriate output format:

1. TARGETED PATCH (preferred for 1-3 section changes): Output ONLY the changed sections inside a \
```resume-patch code block. Use **SECTION NAME** (bold all-caps) headings — the same format as the resume.
   Example:
   ```resume-patch
   **SUMMARY**
   Revised summary text here.

   **SKILLS**
   Updated skills content here.
   ```

2. FULL REVISION (use only for comprehensive rewrites or when restructuring the whole resume): \
Output the complete revised resume inside a ```markdown code block.

3. ADVICE ONLY (no edits needed): Reply in plain text with no code block.

Keep the patch minimal — only include sections that actually change."""


@router.post("/chat")
@limiter.limit("30/hour")
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
            loop_messages = list(full_messages)
            max_iterations = 5  # guard against infinite tool loops

            for _ in range(max_iterations):
                async with client.beta.messages.stream(
                    model=model,
                    max_tokens=4096,
                    system=_SYSTEM_PROMPT,
                    messages=loop_messages,
                    tools=_CHAT_TOOLS,
                    betas=_CHAT_BETAS,
                ) as stream:
                    async for text in stream.text_stream:
                        yield f"data: {json.dumps({'text': text})}\n\n"
                    final_msg = await stream.get_final_message()

                if final_msg.stop_reason != "tool_use":
                    break

                # Only handle our custom fetch_url tool (web_search is transparent)
                fetch_blocks = [
                    b for b in final_msg.content
                    if b.type == "tool_use" and b.name == "fetch_url"
                ]
                if not fetch_blocks:
                    break

                tool_results = []
                for block in fetch_blocks:
                    url = block.input.get("url", "")
                    content = await _fetch_url(url)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content,
                    })

                loop_messages = loop_messages + [
                    {"role": "assistant", "content": final_msg.content},
                    {"role": "user", "content": tool_results},
                ]
        else:
            # OpenAI-compatible (OpenRouter / Nvidia NIM) — no tool support
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
