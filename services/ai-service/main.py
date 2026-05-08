import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from services.blocked_patterns import check_blocked, check_greeting
from services.classify_ack import detect_ack, get_ack_reply, seed_ack_replies
from services.intent_classifier import classify_message
from services.response_validator import validate_response
from services.llm.factory import get_provider
from services.smart_suggestions import get_suggestions as smart_get_suggestions
from services.continuation import get_continuation, render_continuation
from services.tools import (
    TOOLS,
    STAFF_TOOLS_REQUIRING_TEXT,
    dispatch_tool,
    ToolContext,
    ToolNotFoundError,
    ToolValidationError,
)

app = FastAPI(title="Restaurant AI Service", version="0.2.0")


@app.on_event("startup")
async def _seed_redis_pools() -> None:
    """
    Idempotent Redis seeding at app start.

    `seed_ack_replies` is a no-op when the `ack:replies` list already has
    entries (LLEN > 0) — first boot of a fresh Redis instance gets the
    canonical list, subsequent boots leave the rotating pool intact.
    """
    try:
        seed_ack_replies()
    except Exception:
        # Don't crash the app on Redis hiccups — `get_ack_reply()` falls
        # back to the in-memory ACK_REPLIES list anyway.
        import logging
        logging.exception("Failed to seed ack:replies pool — using fallback list")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DTOs ---

class ChatMessage(BaseModel):
    role: str
    content: str


class ClassifyRequest(BaseModel):
    message: str
    tenant_context: dict | None = None
    history: list[ChatMessage] = []


class ClassifyResponse(BaseModel):
    allowed: bool
    reason: str | None = None
    confidence: float = 1.0


class ChatRequest(BaseModel):
    # Both `message` and `text` are accepted to ease migration. We coalesce
    # to a single string downstream.
    message: str | None = None
    text: str | None = None
    history: list[ChatMessage] = []
    tenant_context: dict = {}
    customer_context: dict | None = None
    tenantId: str | None = None
    customerId: str | None = None
    sessionId: str | None = None


class ChatResponse(BaseModel):
    response: str
    tokens_in: int
    tokens_out: int
    model: str
    provider: str
    latency_ms: int
    estimated_cost_cents: int
    # Set when the ack layer matched — FE can decide to suppress the bubble
    # (silent path) or render it as a tiny acknowledgment.
    layer: str | None = None


class SmartSuggestionsRequest(BaseModel):
    tenantId: str
    customerId: str | None = None
    sessionId: str | None = None
    limit: int | None = 3
    # `surface` = UI placement (required, matches shared-types contract).
    # `situacao` = trigger context (optional · ex: 'pedido_atrasado',
    # 'chamado_sem_resposta'). Both can be set independently. See module
    # docstring in `services/smart_suggestions.py` for the glossary.
    surface: str = "home"
    situacao: str | None = None


class SmartSuggestionsResponse(BaseModel):
    suggestions: list[dict]
    poolExpiresAt: str
    # Optional alias echoed back when the request set `situacao`. Same
    # rationale as above — FE may key analytics off this.
    situacao: str | None = None


class ContinuationRequest(BaseModel):
    tenantId: str
    customerId: str | None = None
    isReturning: bool = False
    isVip: bool = False
    customerName: str | None = None
    favoriteItem: str | None = None
    kind: str | None = None


class ContinuationResponse(BaseModel):
    message: dict | None
    rendered: str | None


class ToolDispatchRequest(BaseModel):
    name: str
    args: dict = {}
    tenantId: str
    customerId: str | None = None
    sessionId: str | None = None
    waiterId: str | None = None
    isStaff: bool = False
    isManager: bool = False
    sessionFlags: dict = {}
    rawMessage: str | None = None


class ToolDispatchResponse(BaseModel):
    name: str
    silent: bool
    requiresText: bool
    router: bool
    result: dict


# --- Endpoints ---

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "provider": settings.LLM_PROVIDER,
        "model_main": settings.LLM_MODEL_MAIN,
        "model_classifier": settings.LLM_MODEL_CLASSIFIER,
        "tools_registered": len(TOOLS),
    }


@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    """4-layer classification cascade: greeting → ack → regex → LLM."""

    # Layer 0: Greeting detection (zero cost, zero tokens)
    if check_greeting(req.message):
        return ClassifyResponse(allowed=True, reason="greeting", confidence=1.0)

    # Layer 1 (NEW · 4th layer): Ack detection. Brief affirmations don't
    # need a tool nor a classifier hit — they get a small canned reply
    # or no reply at all.
    ack = detect_ack(req.message)
    if ack:
        return ClassifyResponse(allowed=True, reason="ack", confidence=ack.confidence)

    # Layer 2: Regex guardrails (zero cost)
    is_blocked, reason = check_blocked(req.message)
    if is_blocked:
        return ClassifyResponse(allowed=False, reason=reason, confidence=1.0)

    # Heuristica de follow-up: mensagens curtas (<=4 palavras) apos contexto
    # do restaurante normalmente sao confirmacoes/referencias.
    word_count = len(req.message.strip().split())
    if word_count <= 4 and len(req.history) > 0:
        return ClassifyResponse(allowed=True, reason="short-followup", confidence=0.95)

    # Layer 3: LLM classifier
    try:
        history_dicts = [{"role": m.role, "content": m.content} for m in req.history[-4:]]
        result = await classify_message(req.message, history=history_dicts)
        return ClassifyResponse(
            allowed=result["allowed"],
            reason=result["reason"],
            confidence=result["confidence"],
        )
    except Exception:
        return ClassifyResponse(allowed=True, reason=None, confidence=0.5)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Main chat endpoint with the 4th-layer ack short-circuit."""

    start_time = time.time()

    text = (req.message or req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty message")

    # Layer A · ACK short-circuit. No LLM call, no tool dispatch.
    ack = detect_ack(text)
    if ack and not ack.silent:
        # Rotate through the Redis-backed pool — every customer gets a
        # different reply on consecutive acks instead of the same hash bucket.
        # Falls back to the in-memory ACK_REPLIES list when Redis is down.
        reply = get_ack_reply()
        return ChatResponse(
            response=reply,
            tokens_in=0,
            tokens_out=0,
            model="ack-layer",
            provider="local",
            latency_ms=int((time.time() - start_time) * 1000),
            estimated_cost_cents=0,
            layer="ack",
        )
    if ack and ack.silent:
        # Silent ack — return an empty response. FE can suppress entirely.
        return ChatResponse(
            response="",
            tokens_in=0, tokens_out=0,
            model="ack-layer", provider="local",
            latency_ms=int((time.time() - start_time) * 1000),
            estimated_cost_cents=0,
            layer="ack-silent",
        )

    # Otherwise hand off to the regular LLM chat path.
    provider = get_provider()
    system_prompt = build_system_prompt(req.tenant_context, req.customer_context)

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": text})

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
        layer="llm",
    )


@app.post("/smart-suggestions", response_model=SmartSuggestionsResponse)
async def smart_suggestions(req: SmartSuggestionsRequest):
    """Deterministic-pool-backed chip suggestions for the home / idle / post-rating surfaces."""
    out = smart_get_suggestions(
        tenant_id=req.tenantId,
        surface=req.surface,
        limit=req.limit or 3,
        customer_id=req.customerId,
        session_id=req.sessionId,
        situacao=req.situacao,
    )
    return SmartSuggestionsResponse(**out)


@app.post("/continuation", response_model=ContinuationResponse)
async def continuation(req: ContinuationRequest):
    """Picks a continuation message for the customer + segment."""
    msg = get_continuation(
        tenant_id=req.tenantId,
        customer_ctx={
            "is_returning": req.isReturning,
            "is_vip": req.isVip,
            "customer_name": req.customerName or "",
            "favorite_item": req.favoriteItem or "",
        },
        kind=req.kind,
    )
    if not msg:
        return ContinuationResponse(message=None, rendered=None)

    rendered = render_continuation(msg, {
        "customerName": req.customerName or "",
        "favoriteItem": req.favoriteItem or "",
        "tableLabel": "",
    })
    return ContinuationResponse(message=msg, rendered=rendered)


@app.get("/continuation")
async def continuation_get(
    tenantId: str,
    customerId: str | None = None,
    isReturning: bool = False,
    isVip: bool = False,
    customerName: str | None = None,
):
    """GET variant for the apps/api home.service to call."""
    msg = get_continuation(
        tenant_id=tenantId,
        customer_ctx={
            "is_returning": isReturning,
            "is_vip": isVip,
            "customer_name": customerName or "",
        },
    )
    if not msg:
        return {"message": None, "rendered": None}
    rendered = render_continuation(msg, {"customerName": customerName or ""})
    return {"message": msg, "rendered": rendered}


@app.post("/tools/dispatch", response_model=ToolDispatchResponse)
async def tools_dispatch(req: ToolDispatchRequest):
    """Server-side tool dispatcher exposed for orchestrators that don't run LLM tool-use natively."""
    ctx = ToolContext(
        tenant_id=req.tenantId,
        customer_id=req.customerId,
        session_id=req.sessionId,
        waiter_id=req.waiterId,
        is_staff=req.isStaff,
        is_manager=req.isManager,
        session_flags=req.sessionFlags or {},
        raw_message=req.rawMessage,
    )

    try:
        result = dispatch_tool(req.name, req.args or {}, ctx)
    except ToolNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ToolValidationError as e:
        raise HTTPException(status_code=e.status_code, detail={
            "message": str(e),
            "chip": e.chip_label,
        })

    meta = TOOLS[req.name]
    return ToolDispatchResponse(
        name=req.name,
        silent=meta.silent,
        requiresText=meta.requires_text,
        router=meta.router,
        result={
            "message": result.message,
            "chips": result.chips,
            "silent": result.silent,
            "actionPayload": result.action_payload,
            "routerTarget": result.router_target,
            "error": result.error,
        },
    )


@app.get("/tools")
async def list_tools():
    """Inventory endpoint — handy for FE/QA introspection."""
    return {
        "count": len(TOOLS),
        "staff_tools_requiring_text": sorted(STAFF_TOOLS_REQUIRING_TEXT),
        "tools": [
            {
                "name": meta.name,
                "audience": meta.audience,
                "silent": meta.silent,
                "requiresText": meta.requires_text,
                "router": meta.router,
            }
            for meta in TOOLS.values()
        ],
    }


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
8. SEMPRE escreva em português do Brasil com acentos (ex: "olá", "você", "experiência", "não", "bebida", "função")

REGRAS LGPD (privacidade · obrigatório):
- Quando o cliente puxar assunto de LGPD, exclusão de dados ou direito de
  esquecimento (ex: "quero apagar meus dados", "vocês guardam minhas
  informações?", "quais meus direitos LGPD"), SEMPRE chame a tool
  `show_lgpd_notice` PRIMEIRO. Ela retorna o texto canônico e os 2 chips
  de consentimento. NUNCA componha o aviso LGPD com suas próprias palavras
  nem cole o texto inline.
- Só chame `lgpd_data_request` DEPOIS que o cliente tap no chip "Sim, quero
  excluir" ou responder afirmativamente em texto livre. Não pule a etapa
  do notice — ela é obrigatória pra captura de consentimento."""

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
        # VIP tone hint per vip-customer.md — affects copy via the system prompt.
        if customer_context.get("is_vip"):
            prompt += "\n\nObservação: este cliente é VIP nessa sessão. Tom mais caloroso e atento."

    return prompt
