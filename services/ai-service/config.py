import os


class Settings:
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    # Endpoint OpenAI-compatible customizavel. Em branco => API oficial da OpenAI.
    # Apontar pra LM Studio: http://localhost:1234/v1
    # Apontar pra Ollama:    http://localhost:11434/v1
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL_MAIN: str = os.getenv("LLM_MODEL_MAIN", "gpt-4o")
    LLM_MODEL_CLASSIFIER: str = os.getenv("LLM_MODEL_CLASSIFIER", "gpt-4o-mini")
    # OpenAI-compatible local models may spend the entire completion budget
    # on hidden reasoning and return empty `content`. LM Studio accepts
    # `reasoning_effort=none`; leave blank for providers that do not.
    LLM_REASONING_EFFORT: str = os.getenv("LLM_REASONING_EFFORT", "").strip()
    # Timeout generoso pra provedores locais (MLX no M3 Max pode levar 2-3s em prompts longos).
    LLM_REQUEST_TIMEOUT: float = float(os.getenv("LLM_REQUEST_TIMEOUT", "60"))
    # LM Studio com modelos locais pode subir com contexto menor que o payload
    # completo de system prompt + tool schemas. Estes flags mantem o contrato
    # de tools, mas reduzem descricoes redundantes em ambiente de teste local.
    LLM_COMPACT_PROMPT: bool = os.getenv("LLM_COMPACT_PROMPT", "false").lower() in {"1", "true", "yes"}
    LLM_COMPACT_TOOL_SCHEMAS: bool = os.getenv("LLM_COMPACT_TOOL_SCHEMAS", "false").lower() in {"1", "true", "yes"}
    # Base URL for `apps/api` — used by `ToolContext.api_client` so tools can
    # call back into the NestJS backend (waiter calls, table-merge, etc.).
    # Empty string disables the HTTP client (tests, offline runs); tools
    # then fall through to their `not_implemented` path. Default points to
    # the local NestJS dev server.
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:3000")
    API_REQUEST_TIMEOUT: float = float(os.getenv("API_REQUEST_TIMEOUT", "10"))
    # Reserved for a future VERIFIED staff-delegation path. The current
    # `/tools/dispatch` endpoint never injects this secret from body-claimed
    # staffId/isManager fields (confused-deputy barrier in main.py).
    STAFF_API_KEY: str = os.getenv("STAFF_API_KEY", "")
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3003,http://localhost:3001,http://localhost:3002"
    ).split(",")


settings = Settings()
