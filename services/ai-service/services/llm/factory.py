from .base import LLMProvider
from config import settings


def create_provider() -> LLMProvider:
    """Factory: returns the correct LLM provider based on LLM_PROVIDER env var."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai":
        from .providers.openai_provider import OpenAIProvider
        return OpenAIProvider(api_key=settings.LLM_API_KEY)
    elif provider == "anthropic":
        from .providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=settings.LLM_API_KEY)
    elif provider == "google":
        from .providers.google_provider import GoogleProvider
        return GoogleProvider(api_key=settings.LLM_API_KEY)
    else:
        raise ValueError(f"LLM provider nao suportado: {provider}. Use: openai, anthropic, google")


# Singleton instance
_provider: LLMProvider | None = None


def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = create_provider()
    return _provider
