import json
from typing import Any, Optional
from ..base import LLMProvider


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str = "", timeout: float = 60.0):
        from openai import AsyncOpenAI
        kwargs: dict = {"api_key": api_key or "sk-no-key", "timeout": timeout}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = AsyncOpenAI(**kwargs)

    async def chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        # Build kwargs incrementally — passing tools=None breaks LM Studio
        # (which is strict about the OpenAI schema · qwen2.5-7b expects the
        # field absent rather than null).
        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            create_kwargs["tools"] = tools
            # `tool_choice="auto"` is the default but pinning it makes the
            # behaviour explicit for local servers that don't honour the
            # spec default.
            create_kwargs["tool_choice"] = "auto"

        response = await self.client.chat.completions.create(**create_kwargs)

        choice = response.choices[0]
        usage = response.usage

        # Extract tool_calls when present. OpenAI returns them as SDK objects;
        # we serialise to a stable dict shape so apps/api can persist as JSONB
        # and FE can reason about them without coupling to SDK types.
        tool_calls: Optional[list[dict[str, Any]]] = None
        raw_tool_calls = getattr(choice.message, "tool_calls", None)
        if raw_tool_calls:
            tool_calls = []
            for tc in raw_tool_calls:
                fn = getattr(tc, "function", None)
                fn_name = getattr(fn, "name", None) if fn else None
                fn_args_raw = getattr(fn, "arguments", None) if fn else None
                # `arguments` arrives as a JSON-encoded string; parse so the
                # dispatcher can pass the dict straight to call().
                fn_args: dict[str, Any] = {}
                if isinstance(fn_args_raw, str) and fn_args_raw.strip():
                    try:
                        fn_args = json.loads(fn_args_raw)
                    except json.JSONDecodeError:
                        # Keep raw on parse failure — caller decides how to surface it.
                        fn_args = {"_raw": fn_args_raw}
                tool_calls.append({
                    "id": getattr(tc, "id", None),
                    "type": getattr(tc, "type", "function"),
                    "function": {
                        "name": fn_name,
                        "arguments": fn_args,
                    },
                })

        return {
            "response": choice.message.content or "",
            "tokens_in": usage.prompt_tokens if usage else 0,
            "tokens_out": usage.completion_tokens if usage else 0,
            "model": model,
            "tool_calls": tool_calls,
        }

    async def classify(
        self,
        prompt: str,
        model: str,
        max_tokens: int = 50,
    ) -> dict:
        response = await self.client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.0,
        )

        choice = response.choices[0]
        usage = response.usage

        return {
            "response": choice.message.content or "",
            "tokens_in": usage.prompt_tokens if usage else 0,
            "tokens_out": usage.completion_tokens if usage else 0,
        }

    def estimate_cost_cents(self, tokens_in: int, tokens_out: int, model: str) -> int:
        # Rough estimates per 1M tokens
        costs = {
            "gpt-4o": (2.5, 10.0),
            "gpt-4o-mini": (0.15, 0.6),
        }
        in_cost, out_cost = costs.get(model, (2.5, 10.0))
        cost = (tokens_in * in_cost + tokens_out * out_cost) / 1_000_000
        return max(1, int(cost * 100))
