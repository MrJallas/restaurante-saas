import os


class Settings:
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL_MAIN: str = os.getenv("LLM_MODEL_MAIN", "gpt-4o")
    LLM_MODEL_CLASSIFIER: str = os.getenv("LLM_MODEL_CLASSIFIER", "gpt-4o-mini")
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3003,http://localhost:3001,http://localhost:3002"
    ).split(",")


settings = Settings()
