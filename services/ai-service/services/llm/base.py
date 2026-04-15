from abc import ABC, abstractmethod
from typing import Optional


class LLMProvider(ABC):
    """Abstract base for LLM providers. No SDK imports at this level."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
    ) -> dict:
        """
        Returns: { response: str, tokens_in: int, tokens_out: int, model: str }
        """
        ...

    @abstractmethod
    async def classify(
        self,
        prompt: str,
        model: str,
        max_tokens: int = 50,
    ) -> dict:
        """
        Returns: { response: str, tokens_in: int, tokens_out: int }
        """
        ...

    def estimate_cost_cents(self, tokens_in: int, tokens_out: int, model: str) -> int:
        """Rough cost estimate in cents. Override per provider for accuracy."""
        # Default rough estimate: $0.01 per 1K tokens
        total_tokens = tokens_in + tokens_out
        return max(1, int(total_tokens * 0.001))
