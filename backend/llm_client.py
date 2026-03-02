"""
LLM client factory supporting Anthropic, OpenRouter, and Nvidia NIM.

Usage:
    client, model = get_client("chat")   # returns (client, model_str)

The client is either an AsyncAnthropic instance or an openai.AsyncOpenAI
instance (both OpenRouter and NIM are OpenAI-compatible).

Callers check `isinstance(client, AsyncAnthropic)` to decide which
API style to use.
"""

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from config import (
    ANTHROPIC_API_KEY,
    CHAT_MODEL, CHAT_PROVIDER,
    NVIDIA_NIM_API_KEY, NVIDIA_NIM_BASE_URL,
    OPENROUTER_API_KEY, OPENROUTER_BASE_URL,
    OPTIMIZE_MODEL, OPTIMIZE_PROVIDER,
    SCORE_MODEL, SCORE_PROVIDER,
)

_TASK_CONFIG = {
    "chat": (CHAT_PROVIDER, CHAT_MODEL),
    "optimize": (OPTIMIZE_PROVIDER, OPTIMIZE_MODEL),
    "score": (SCORE_PROVIDER, SCORE_MODEL),
}


def get_client(task: str) -> tuple[AsyncAnthropic | AsyncOpenAI, str]:
    """Return (client, model_name) for the given task."""
    provider, model = _TASK_CONFIG.get(task, ("anthropic", "claude-sonnet-4-6"))

    if provider == "anthropic":
        return AsyncAnthropic(api_key=ANTHROPIC_API_KEY), model

    if provider == "openrouter":
        return AsyncOpenAI(
            api_key=OPENROUTER_API_KEY,
            base_url=OPENROUTER_BASE_URL,
        ), model

    if provider == "nvidia_nim":
        return AsyncOpenAI(
            api_key=NVIDIA_NIM_API_KEY,
            base_url=NVIDIA_NIM_BASE_URL,
        ), model

    raise ValueError(f"Unknown provider: {provider!r}")
