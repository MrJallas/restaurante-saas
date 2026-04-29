import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from services.blocked_patterns import check_blocked, check_greeting
from services.intent_classifier import classify_message
from services.response_validator import validate_response
from services.llm.factory import get_provider

app = FastAPI(title="Restaurant AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DTOs ---

class ClassifyRequest(BaseModel):
    message: str
    tenant_context: dict | None = None
    # Historico recente da conversa (2-4 mensagens) usado pelo classificador
    # para entender follow-ups curtos tipo "os dois", "quanto?", "quero esse".
    history: list["ChatMessage"] = []


class ClassifyResponse(BaseModel):
    allowed: bool
    reason: str | None = None
    confidence: float = 1.0


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    tenant_context: dict = {}
    customer_context: dict | None = None


class ChatResponse(BaseModel):
    response: str
    tokens_in: int
    tokens_out: int
    model: str
    provider: str
    latency_ms: int
    estimated_cost_cents: int


# --- Endpoints ---

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "provider": settings.LLM_PROVIDER,
        "model_main": settings.LLM_MODEL_MAIN,
        "model_classifier": settings.LLM_MODEL_CLASSIFIER,
    }


@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    """3-layer classification: regex guardrails → LLM classifier."""

    # Layer 0: Greeting detection (zero cost, zero tokens)
    if check_greeting(req.message):
        return ClassifyResponse(allowed=True, reason="greeting", confidence=1.0)

    # Layer 1: Regex guardrails (zero cost)
    is_blocked, reason = check_blocked(req.message)
    if is_blocked:
        return ClassifyResponse(allowed=False, reason=reason, confidence=1.0)

    # Heurística de follow-up: mensagens curtas (<=4 palavras) apos contexto
    # do restaurante normalmente sao confirmacoes/referencias ("os dois",
    # "quero esse", "quanto?"). Nao faz sentido reclassificar isolado.
    word_count = len(req.message.strip().split())
    if word_count <= 4 and len(req.history) > 0:
        return ClassifyResponse(allowed=True, reason="short-followup", confidence=0.95)

    # Layer 2: LLM classifier (com historico pra reduzir falsos positivos)
    try:
        history_dicts = [{"role": m.role, "content": m.content} for m in req.history[-4:]]
        result = await classify_message(req.message, history=history_dicts)
        return ClassifyResponse(
            allowed=result["allowed"],
            reason=result["reason"],
            confidence=result["confidence"],
        )
    except Exception:
        # On classifier failure, allow the message through (fail open)
        return ClassifyResponse(allowed=True, reason=None, confidence=0.5)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Main chat endpoint with context injection."""

    start_time = time.time()
    provider = get_provider()

    # Build system prompt with restaurant context
    system_prompt = build_system_prompt(req.tenant_context, req.customer_context)

    # Build message history
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:  # Keep last 10 messages for context
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})

    try:
        result = await provider.chat(
            messages=messages,
            model=settings.LLM_MODEL_MAIN,
            max_tokens=500,
            temperature=0.7,
        )
    except Exception as e:
        import logging
        logging.exception("LLM chat failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Desculpe, estou com dificuldade no momento. Posso ajudar em breve.",
        )

    # Layer 3: Response validation
    validated_response, was_replaced = validate_response(result["response"])

    latency_ms = int((time.time() - start_time) * 1000)
    cost = provider.estimate_cost_cents(result["tokens_in"], result["tokens_out"], settings.LLM_MODEL_MAIN)

    return ChatResponse(
        response=validated_response,
        tokens_in=result["tokens_in"],
        tokens_out=result["tokens_out"],
        model=result["model"],
        provider=settings.LLM_PROVIDER,
        latency_ms=latency_ms,
        estimated_cost_cents=cost,
    )


def build_system_prompt(tenant_context: dict, customer_context: dict | None) -> str:
    """Builds system prompt with restaurant and customer context."""

    restaurant_name = tenant_context.get("restaurant_name", "o restaurante")
    menu_summary = tenant_context.get("menu_summary", "")
    categories = tenant_context.get("categories", "")

    prompt = f"""Você é o assistente virtual do restaurante "{restaurant_name}".
Sua função é ajudar os clientes EXCLUSIVAMENTE com assuntos do restaurante:
- Recomendar pratos, bebidas e sobremesas do cardápio
- Informar sobre ingredientes, alérgenos e restrições alimentares
- Ajudar com dúvidas sobre preços e promoções
- Dar informações sobre o restaurante

REGRAS IMPORTANTES:
1. NUNCA fale sobre assuntos fora do restaurante
2. Seja amigável, conciso e natural (máximo 3 frases)
3. Use linguagem informal brasileira com acentuação correta (á, é, í, ó, ú, â, ê, ô, ã, õ, ç)
4. Quando recomendar, sugira 2-3 opções do cardápio
5. Se não souber a resposta, diga que vai consultar a equipe
6. NUNCA invente pratos que não estejam no cardápio
7. Preços estão em centavos, converta para reais (divida por 100)
8. SEMPRE escreva em português do Brasil com acentos (ex: "olá", "você", "experiência", "não", "bebida", "função")"""

    if categories:
        prompt += f"\n\nCATEGORIAS DO CARDÁPIO:\n{categories}"

    if menu_summary:
        prompt += f"\n\nITENS DO CARDÁPIO:\n{menu_summary}"

    if customer_context:
        name = customer_context.get("name", "")
        if name:
            prompt += f"\n\nCLIENTE: {name}"
        last_items = customer_context.get("last_items", [])
        if last_items:
            items_str = ", ".join([i.get("name", "") for i in last_items if i.get("name")])
            prompt += f"\nÚltimos pedidos do cliente: {items_str}"

    return prompt
