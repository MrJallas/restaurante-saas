from typing import Any, Optional
from ..base import LLMProvider


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
        # Anthropic has its own tool-use format; the OpenAI-style schemas we
        # generate aren't directly compatible. F2 round only wires tools for
        # the OpenAI-compat path (LM Studio + GPT). Drop silently for now —
        # no tool_calls returned to caller.
        _ = tools  # noqa: F841 — explicit intent
        # Extract system message if present
        system = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                chat_messages.append(msg)

        kwargs = {
            "model": model,
            "messages": chat_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)

        return {
            "response": response.content[0].text if response.content else "",
            "tokens_in": response.usage.input_tokens,
            "tokens_out": response.usage.output_tokens,
            "model": model,
            "tool_calls": None,
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
            "response": response.content[0].text if response.content else "",
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
