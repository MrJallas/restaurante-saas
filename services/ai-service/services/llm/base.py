from abc import ABC, abstractmethod
from typing import Any, Optional


class LLMProvider(ABC):
    """Abstract base for LLM providers. No SDK imports at this level."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        """
        Returns: {
            response: str,
            tokens_in: int,
            tokens_out: int,
            model: str,
            tool_calls: list[dict] | None  # OpenAI shape: [{id, type, function:{name, arguments}}]
        }

        When `tools` is passed, the provider MUST forward the schema to the
        underlying API (e.g. OpenAI tools=[...]) and surface any returned
        tool_calls back to the caller. Providers that don't support function
        calling should silently drop `tools` and always return tool_calls=None.
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
