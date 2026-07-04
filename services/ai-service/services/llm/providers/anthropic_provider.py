import logging
from typing import Any, Optional
from ..base import LLMProvider

logger = logging.getLogger(__name__)


def _to_anthropic_tools(
    tools: Optional[list[dict[str, Any]]],
) -> Optional[list[dict[str, Any]]]:
    """Map OpenAI-style tool schemas → Anthropic's native tool format.

    OpenAI envelope (see services/tools/schemas.py):
        {"type": "function",
         "function": {"name", "description", "parameters": {...json schema...}}}

    Anthropic wants a flat shape:
        {"name", "description", "input_schema": {...json schema...}}

    Non-function entries are skipped. Returns None when there's nothing to send
    so `chat()` can omit the kwarg entirely.
    """
    if not tools:
        return None
    mapped: list[dict[str, Any]] = []
    for t in tools:
        fn = t.get("function") if isinstance(t, dict) else None
        if not fn:
            continue
        name = fn.get("name")
        if not name:
            continue
        mapped.append(
            {
                "name": name,
                "description": fn.get("description", ""),
                # OpenAI `parameters` IS a JSON Schema object — Anthropic calls
                # the same thing `input_schema`. Default to a permissive object
                # so a tool without params still validates.
                "input_schema": fn.get("parameters")
                or {"type": "object", "properties": {}},
            }
        )
    return mapped or None


def _extract_text(content: Any) -> str:
    """First text block's text, or "" — mirrors the old response.content[0].text
    but tolerates tool_use blocks appearing before/around the text."""
    if not content:
        return ""
    for block in content:
        if getattr(block, "type", None) == "text":
            return getattr(block, "text", "") or ""
    return ""


def _extract_tool_calls(content: Any) -> Optional[list[dict[str, Any]]]:
    """Map Anthropic `tool_use` content blocks → the normalised OpenAI shape the
    rest of ai-service expects (same as openai_provider):
        [{id, type:"function", function:{name, arguments:<dict>}}]

    Anthropic delivers `input` already as a dict, so no json.loads needed.
    """
    if not content:
        return None
    tool_calls: list[dict[str, Any]] = []
    for block in content:
        if getattr(block, "type", None) != "tool_use":
            continue
        raw_args = getattr(block, "input", None)
        args: dict[str, Any] = raw_args if isinstance(raw_args, dict) else {}
        tool_calls.append(
            {
                "id": getattr(block, "id", None),
                "type": "function",
                "function": {
                    "name": getattr(block, "name", None),
                    "arguments": args,
                },
            }
        )
    return tool_calls or None


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str):
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)

    async def chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        # Extract system message if present
        system = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": chat_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system

        # Forward the tool schemas so Claude can actually emit tool_use blocks.
        # P1-G: previously `_ = tools` dropped these silently, so add_to_order
        # (and every other mutating tool) was dead on any Anthropic deploy.
        anthropic_tools = _to_anthropic_tools(tools)
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools
            kwargs["tool_choice"] = {"type": "auto"}

        response = await self.client.messages.create(**kwargs)

        return {
            "response": _extract_text(response.content),
            "tokens_in": response.usage.input_tokens,
            "tokens_out": response.usage.output_tokens,
            "model": model,
            "tool_calls": _extract_tool_calls(response.content),
        }

    async def classify(
        self,
        prompt: str,
        model: str,
        max_tokens: int = 50,
    ) -> dict:
        response = await self.client.messages.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.0,
        )

        return {
            "response": _extract_text(response.content),
            "tokens_in": response.usage.input_tokens,
            "tokens_out": response.usage.output_tokens,
        }

    def estimate_cost_cents(self, tokens_in: int, tokens_out: int, model: str) -> int:
        costs = {
            "claude-sonnet-4-20250514": (3.0, 15.0),
            "claude-haiku-4-20250414": (0.25, 1.25),
        }
        in_cost, out_cost = costs.get(model, (3.0, 15.0))
        cost = (tokens_in * in_cost + tokens_out * out_cost) / 1_000_000
        return max(1, int(cost * 100))
