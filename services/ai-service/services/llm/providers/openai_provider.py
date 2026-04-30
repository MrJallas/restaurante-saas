import time
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
    ) -> dict:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        choice = response.choices[0]
        usage = response.usage

        return {
            "response": choice.message.content or "",
            "tokens_in": usage.prompt_tokens if usage else 0,
            "tokens_out": usage.completion_tokens if usage else 0,
            "model": model,
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
