from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings

app = FastAPI(title="Restaurant AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "provider": settings.LLM_PROVIDER,
        "model_main": settings.LLM_MODEL_MAIN,
        "model_classifier": settings.LLM_MODEL_CLASSIFIER,
    }
