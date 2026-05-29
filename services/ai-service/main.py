import os
import time
import re
from hmac import compare_digest
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from pydantic import BaseModel

from config import settings
from services.blocked_patterns import check_blocked, check_greeting
from services.classify_ack import (
    detect_ack,
    get_ack_reply,
    is_allowed_intent,
    seed_ack_replies,
)
from services.intent_classifier import classify_message
from services.response_validator import validate_response
from services.llm.factory import get_provider
from services.smart_suggestions import get_suggestions as smart_get_suggestions
from services.continuation import (
    get_continuation,
    render_continuation,
    get_continuation_full,
)
from services.tools import (
    TOOLS,
    STAFF_TOOLS_REQUIRING_TEXT,
    dispatch_tool,
    ToolContext,
    ToolNotFoundError,
    ToolValidationError,
)
from services.tools.schemas import get_tool_schemas
from services.api_client import make_http_api_client

app = FastAPI(title="Restaurant AI Service", version="0.2.0")


# Shared HTTP client for tool dispatch. We instantiate ONE per process and
# inject it into every `ToolContext` (P0 #7) — without this, every tool
# that calls `ctx.api_client(...)` saw `None` and short-circuited their
# backend calls. Returns None when API_BASE_URL is empty (test/offline).
def _build_api_client():
    if not settings.API_BASE_URL:
        return None
    try:
        return make_http_api_client(
            settings.API_BASE_URL,
            timeout=settings.API_REQUEST_TIMEOUT,
        )
    except Exception:
        # Don't crash the AI service if httpx fails to import; tools have
        # graceful fallbacks when api_client is None.
        import logging
        logging.exception("Failed to build api_client — tools will see None")
        return None


_api_client = _build_api_client()


def _context_api_client(
    tenant_id: str | None,
    session_id: str | None,
    staff_id: str | None = None,
):
    """
    Scope the process-wide apps/api client to one tool invocation.

    Tool modules use canonical paths like `/menu/search`; apps/api routes are
    tenant-prefixed and menu routes require `x-session-token`. This wrapper
    adds both without making every tool know about HTTP auth details.
    """
    if not _api_client:
        return None

    clean_tenant = (tenant_id or "").strip().strip("/")
    clean_session = (session_id or "").strip()
    clean_staff = (staff_id or "").strip()

    def _call(method: str, path: str, body=None):
        normalised = path if path.startswith("/") else f"/{path}"
        if clean_tenant:
            tenant_prefix = f"/{clean_tenant}"
            if normalised != tenant_prefix and not normalised.startswith(f"{tenant_prefix}/"):
                normalised = f"{tenant_prefix}{normalised}"
        headers = {}
        if clean_session:
            headers["x-session-token"] = clean_session
        if clean_staff:
            headers["x-staff-id"] = clean_staff
            if settings.STAFF_API_KEY:
                headers["x-staff-key"] = settings.STAFF_API_KEY
        return _api_client(method, normalised, body, headers=headers)

    return _call


_CANCEL_MANAGER_MESSAGE_RE = re.compile(
    r"\b(deixa\s+pra\s+l[aá]|cancela|cancelar|n[aã]o\s+(precisa|quero)|esquece)\b",
    re.IGNORECASE,
)
_MANAGER_MESSAGE_PROMPT_RE = re.compile(
    r"\b(mensagem|comunicar|recado)\b.*\b(gerente|ger[eê]ncia)\b|\bgerente\b.*\b(comunicar|mensagem|recado)\b",
    re.IGNORECASE,
)
_ORDER_STATUS_RE = re.compile(
    r"\b(quanto\s+tempo|demora|vai\s+demorar|cad[eê]|status|andamento|previs[aã]o|quando)\b.*\b(pedido|comida|prato|cozinha)\b|"
    r"\b(pedido|comida|prato|cozinha)\b.*\b(quanto\s+tempo|demora|vai\s+demorar|cad[eê]|status|andamento|previs[aã]o|quando)\b",
    re.IGNORECASE,
)
_VIEW_ORDER_RE = re.compile(
    r"\b(ver|v[eê]|olhar|mostrar|consultar|acompanhar)\b.*\b(meu|minha|o|a|esse|este)?\s*(pedido|comanda|carrinho)\b|"
    r"\b(pedido|comanda|carrinho)\b.*\b(ver|v[eê]|olhar|mostrar|consultar|acompanhar)\b",
    re.IGNORECASE,
)
_PAYMENT_RE = re.compile(
    r"\b(quero|queria|pode|vamos|vou|preciso|me\s+ajuda|me\s+ajude)?\s*(pagar|pagamento|fechar|finalizar|pedir|trazer|traz|manda)\b.*\b(conta|comanda)\b|"
    r"\b(conta|comanda)\b.*\b(pagar|pagamento|fechar|finalizar|pedir|trazer|traz|manda)\b|"
    r"\b(quero|queria|vamos|vou)\s+pagar\b",
    re.IGNORECASE,
)
_PAYMENT_SPLIT_RE = re.compile(r"\b(dividir|rachar|separar)\b.*\b(conta|comanda)\b|\b(conta|comanda)\b.*\b(dividir|rachar|separar)\b", re.IGNORECASE)
_PAYMENT_INDIVIDUAL_RE = re.compile(r"\b(minha\s+parte|minha\s+comanda|s[oó]\s+a\s+minha|individual)\b", re.IGNORECASE)
_PAYMENT_FULL_RE = re.compile(r"\b(pagar\s+tudo|conta\s+toda|comanda\s+toda|mesa\s+toda)\b", re.IGNORECASE)
_GLUTEN_FREE_RE = re.compile(
    r"\b(op[cç][oõ]es?|pratos?|recomenda|indica|tem|quais|alguma)\b.*\bsem\s+gl[uú]ten\b|"
    r"\bsem\s+gl[uú]ten\b.*\b(op[cç][oõ]es?|pratos?|recomenda|indica|tem|quais|alguma)\b",
    re.IGNORECASE,
)
_TABLE_MERGE_STATUS_RE = re.compile(
    r"\b(jun[cç][aã]o|juntar|juntou|juntadas?|juntas?)\b|"
    r"\boutra\s+mesa\b|"
    r"\b(mesa|mesas)\b.*\b(aceitou|confirmou|aprovou)\b|"
    r"\b(aceitou|confirmou|aprovou)\b.*\b(mesa|mesas)\b",
    re.IGNORECASE,
)
_JOIN_ACCEPT_RE = re.compile(
    r"\b(pode|pode\s+entrar|sim|s[ií]m|claro|libera|liberar|autoriza|autorizar|deixa|deixe|deixa\s+entrar|ok|beleza)\b",
    re.IGNORECASE,
)
_JOIN_REJECT_RE = re.compile(
    r"\b(n[aã]o|agora\s+n[aã]o|melhor\s+n[aã]o|recusa|recusar|rejeita|rejeitar|n[aã]o\s+deixa|n[aã]o\s+pode|bloqueia)\b",
    re.IGNORECASE,
)


def _last_assistant_requested_manager_message(history: list["ChatMessage"]) -> bool:
    """Detect the follow-up turn after "me conte a mensagem pro gerente"."""
    for msg in reversed(history[-4:]):
        if msg.role != "assistant":
            continue
        content = (msg.content or "").strip()
        if _MANAGER_MESSAGE_PROMPT_RE.search(content):
            return True
        return False
    return False


def _rule_tool_response(
    name: str,
    args: dict,
    req: "ChatRequest",
    text: str,
    start_time: float,
    *,
    layer: str,
) -> "ChatResponse":
    ctx = ToolContext(
        tenant_id=req.tenantId or "",
        customer_id=req.customerId,
        session_id=req.sessionId,
        api_client=_context_api_client(req.tenantId, req.sessionId),
        raw_message=text,
    )
    tool_result = dispatch_tool(name, args, ctx)
    return ChatResponse(
        response=tool_result.message or "",
        tokens_in=0,
        tokens_out=0,
        model="rule-layer",
        provider="local",
        latency_ms=int((time.time() - start_time) * 1000),
        estimated_cost_cents=0,
        layer=layer,
        tool_calls=[
            {
                "id": f"rule_{name}",
                "type": "function",
                "function": {"name": name, "arguments": args},
                "result": {
                    "message": tool_result.message,
                    "chips": tool_result.chips,
                    "silent": tool_result.silent,
                    "actionPayload": tool_result.action_payload,
                    "routerTarget": tool_result.router_target,
                    "error": tool_result.error,
                },
            }
        ],
    )


def _latest_table_merge(customer_context: dict | None) -> dict | None:
    if not customer_context:
        return None
    merge = customer_context.get("latest_table_merge")
    if not isinstance(merge, dict) or not merge.get("status"):
        return None
    return merge


def _pending_join_request(customer_context: dict | None) -> dict | None:
    if not customer_context:
        return None
    pending = customer_context.get("pending_join_request") or customer_context.get("pendingJoinRequest")
    if not isinstance(pending, dict):
        return None
    target = pending.get("targetCustomerId") or pending.get("target_customer_id")
    if not isinstance(target, str) or not target.strip():
        return None
    return {
        "targetCustomerId": target.strip(),
        "joinerName": str(pending.get("joinerName") or pending.get("joiner_name") or "").strip(),
        "requestedAt": str(pending.get("requestedAt") or pending.get("requested_at") or "").strip(),
    }


def _join_decision_tool(text: str, pending_join: dict | None) -> str | None:
    if not pending_join:
        return None
    if _JOIN_REJECT_RE.search(text):
        return "reject_join_request"
    if _JOIN_ACCEPT_RE.search(text):
        return "accept_join_request"
    return None


def _table_label(value) -> str | None:
    if value in (None, "", 0, "0"):
        return None
    return str(value)


def _table_merge_status_response(merge: dict) -> str:
    status = str(merge.get("status") or "")
    origin = _table_label(
        merge.get("origin_table_number") or merge.get("originTableNumber")
    )
    target = _table_label(
        merge.get("target_table_number") or merge.get("targetTableNumber")
    )
    pair = f"as mesas {origin} e {target}" if origin and target else "as mesas"
    approved_a = bool(merge.get("approved_by_a_at") or merge.get("approvedByAAt"))
    approved_b = bool(merge.get("approved_by_b_at") or merge.get("approvedByBAt"))

    if status == "approved":
        return f"Sim, {pair} já estão juntas. Vocês podem escolher se juntam as comandas ou continuam separadas."
    if status == "pending":
        if approved_a and not approved_b:
            return f"A junção ainda está pendente: a mesa de origem já confirmou, falta a outra mesa aceitar."
        if approved_b and not approved_a:
            return f"A junção ainda está pendente: a outra mesa já aceitou, falta o host da mesa de origem confirmar."
        return f"A junção ainda está pendente: falta confirmação dos hosts das duas mesas."
    if status == "rejected":
        return f"A junção entre {pair} não foi aprovada."
    return f"O status atual da junção entre {pair} é {status}."


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


# Round 7 (B-NEW-25): API key middleware — exige `X-AI-Service-Key`
# em todas as rotas exceto health checks. apps/api passa o header com
# valor de `AI_SERVICE_API_KEY` env. Antes: ai-service estava sem auth
# alguma + porta exposta no host = DoS gratuito + LLM bill ilimitado.
#
# Health endpoints (`/health`, `/`) e docs (`/docs`, `/openapi.json`)
# permanecem públicos pra liveness probes do Docker e troubleshooting.
_PUBLIC_PATHS = {"/health", "/", "/docs", "/openapi.json", "/redoc"}


class AiServiceAuthMiddleware(BaseHTTPMiddleware):
    """Auth via header X-AI-Service-Key contra env AI_SERVICE_API_KEY.

    Round 9 (B-NEW-45): fail-CLOSE quando env ausente em prod (NODE_ENV
    ou ENV=production/staging). Antes era fail-open silencioso — k8s
    secret faltando ou .env mal carregado deixava todos requests passar
    sem auth. Em dev local sem docker, fail-open mantido com WARNING
    explícito no log pra que dev veja na consola.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Skip auth pra rotas de saúde / docs.
        if path in _PUBLIC_PATHS or path.startswith("/static"):
            return await call_next(request)

        expected = os.environ.get("AI_SERVICE_API_KEY")
        if not expected:
            env = (
                os.environ.get("ENV")
                or os.environ.get("NODE_ENV")
                or "development"
            ).lower()
            if env in ("production", "prod", "staging"):
                import logging
                logging.error(
                    "AI_SERVICE_API_KEY missing in env=%s — fail-CLOSE blocking %s",
                    env,
                    path,
                )
                return Response(
                    content='{"detail":"AI service auth not configured (production)."}',
                    status_code=503,
                    media_type="application/json",
                )
            # Dev local sem .env — fail-open com warning loud.
            import logging
            logging.warning(
                "AI_SERVICE_API_KEY ausente — middleware desligado (env=%s, dev only).",
                env,
            )
            return await call_next(request)

        provided = request.headers.get("x-ai-service-key", "")
        if not provided or not compare_digest(provided, expected):
            return Response(
                content='{"detail":"Acesso negado. X-AI-Service-Key inválida ou ausente."}',
                status_code=401,
                media_type="application/json",
            )
        return await call_next(request)


app.add_middleware(AiServiceAuthMiddleware)


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
    # Tool calls emitted by the LLM (OpenAI tool_calls shape, normalised by
    # `OpenAIProvider.chat`). When non-empty, the AI service has already
    # dispatched the tools and the caller (apps/api) MUST persist this list
    # into `assistant_messages.tool_calls` for audit/debug. Empty list when
    # the LLM didn't invoke any tool.
    tool_calls: list[dict] = []


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
    # Round 19: rich slots pra contextualidade (pos_reclamacao, chamou_garcom
    # com waitMinutes, abriu_pedido com customerName+waitMinutes etc).
    # Quando ausentes, fallback variants do pool são selecionados.
    managerName: str | None = None
    avgResponseMin: int | None = None
    waitMinutes: int | None = None
    tableLabel: str | None = None
    lastItem: str | None = None
    lastOrderSummary: str | None = None
    lastOrderId: str | None = None
    orderId: str | None = None


class ContinuationResponse(BaseModel):
    message: dict | None
    rendered: str | None
    # Round 3 (Cat 5): chips canon do canvas v20 + subtitle (eyebrow row)
    # + primary_cta opcional (ex: 'abriu_pedido' tem CTA fixo "Acompanhar
    # pedido"). FE renderiza via SuggestionChipRow + ContinuationHome.
    chips: list[dict] = []
    subtitle: str | None = None
    primary_cta: dict | None = None


class ToolDispatchRequest(BaseModel):
    name: str
    args: dict = {}
    tenantId: str
    customerId: str | None = None
    sessionId: str | None = None
    staffId: str | None = None
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

    # Layer 1.5 (P1 #27): allow-list of legitimate restaurant intents that
    # the regex guardrails / LLM classifier was incorrectly bouncing
    # ("tira a cebola", "quero pedir a conta", "junta com a mesa 5", ...).
    # We let these through with confidence=0.95 so they never hit the
    # `block_reason='classifier'` 0-latency path. Order: BEFORE the regex
    # blocker because that's where the false rejections were happening.
    if is_allowed_intent(req.message):
        return ClassifyResponse(allowed=True, reason="allow_list", confidence=0.95)

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

    pending_join = _pending_join_request(req.customer_context)
    join_decision_tool = _join_decision_tool(text, pending_join)
    if join_decision_tool and pending_join:
        return _rule_tool_response(
            join_decision_tool,
            {
                "targetCustomerId": pending_join["targetCustomerId"],
                "reason": text,
            },
            req,
            text,
            start_time,
            layer="rule-join-request-decision",
        )

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

    latest_merge = _latest_table_merge(req.customer_context)
    if latest_merge and _TABLE_MERGE_STATUS_RE.search(text):
        return ChatResponse(
            response=_table_merge_status_response(latest_merge),
            tokens_in=0,
            tokens_out=0,
            model="rule-layer",
            provider="local",
            latency_ms=int((time.time() - start_time) * 1000),
            estimated_cost_cents=0,
            layer="rule-table-merge-status",
            tool_calls=[],
        )

    if _ORDER_STATUS_RE.search(text) or _VIEW_ORDER_RE.search(text):
        return _rule_tool_response(
            "view_order",
            {},
            req,
            text,
            start_time,
            layer="rule-order-status",
        )

    if _PAYMENT_RE.search(text):
        tool_name = "open_payment_screen"
        if _PAYMENT_SPLIT_RE.search(text):
            tool_name = "split_bill"
        elif _PAYMENT_INDIVIDUAL_RE.search(text):
            tool_name = "pay_individual"
        elif _PAYMENT_FULL_RE.search(text):
            tool_name = "pay_full"
        return _rule_tool_response(
            tool_name,
            {},
            req,
            text,
            start_time,
            layer="rule-payment",
        )

    if _GLUTEN_FREE_RE.search(text):
        return _rule_tool_response(
            "recommend_dish",
            {"dietary": "gluten_free"},
            req,
            text,
            start_time,
            layer="rule-gluten-free-recommendation",
        )

    if (
        _last_assistant_requested_manager_message(req.history)
        and not _CANCEL_MANAGER_MESSAGE_RE.search(text)
    ):
        return _rule_tool_response(
            "send_message_to_manager",
            {"text": text},
            req,
            text,
            start_time,
            layer="rule-manager-message-followup",
        )

    # Otherwise hand off to the regular LLM chat path.
    provider = get_provider()
    system_prompt = build_system_prompt(req.tenant_context, req.customer_context)

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": text})

    try:
        # P0 #5 root cause: `tools=[...]` was never being forwarded to the
        # LM Studio OpenAI-compat call, so qwen2.5-7b never had a chance
        # to emit tool_calls — the model didn't know about any tools at
        # all. Passing the canonical schema set fixes this; the provider
        # parses tool_calls back from the response.
        result = await provider.chat(
            messages=messages,
            model=settings.LLM_MODEL_MAIN,
            max_tokens=500,
            temperature=0.7,
            tools=get_tool_schemas(compact=settings.LLM_COMPACT_TOOL_SCHEMAS),
        )
    except Exception as e:
        import logging
        logging.exception("LLM chat failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Desculpe, estou com dificuldade no momento. Posso ajudar em breve.",
        )

    # When the LLM emits tool_calls, dispatch each through the tool registry
    # so backend side-effects happen + we can surface ToolResult.message in
    # the bubble even when the LLM returned no plain text. We append the
    # dispatched result + error info onto each tool_call dict so apps/api
    # can persist a complete audit trail in `assistant_messages.tool_calls`
    # (P0 #5 acceptance criterion).
    raw_tool_calls = result.get("tool_calls") or []
    dispatched_tool_calls: list[dict] = []
    fallback_messages: list[str] = []
    for tc in raw_tool_calls:
        fn = (tc.get("function") or {})
        name = fn.get("name") or ""
        args = fn.get("arguments") or {}
        if not isinstance(args, dict):
            args = {}
        ctx = ToolContext(
            tenant_id=req.tenantId or "",
            customer_id=req.customerId,
            session_id=req.sessionId,
            api_client=_context_api_client(req.tenantId, req.sessionId),
            raw_message=text,
        )
        try:
            tool_result = dispatch_tool(name, args, ctx)
            tc_record = dict(tc)
            tc_record["result"] = {
                "message": tool_result.message,
                "chips": tool_result.chips,
                "silent": tool_result.silent,
                "actionPayload": tool_result.action_payload,
                "routerTarget": tool_result.router_target,
                "error": tool_result.error,
            }
            dispatched_tool_calls.append(tc_record)
            if tool_result.message and not tool_result.silent:
                fallback_messages.append(tool_result.message)
            elif tool_result.error and not tool_result.silent:
                fallback_messages.append(
                    "Não consegui consultar essa informação agora. Quer tentar de novo ou chamar um garçom?"
                )
        except (ToolNotFoundError, ToolValidationError) as e:
            tc_record = dict(tc)
            tc_record["result"] = {"error": {"code": type(e).__name__, "message": str(e)}}
            dispatched_tool_calls.append(tc_record)

    # If the model returned tool_calls but no text, surface the tool messages
    # as the bubble — qwen2.5-7b often omits the assistant text turn when it
    # decides a tool is enough.
    response_text = result["response"] or ""
    if not response_text.strip() and fallback_messages:
        response_text = "\n".join(fallback_messages)

    validated_response, was_replaced = validate_response(response_text)
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
        tool_calls=dispatched_tool_calls,
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
    """Picks a continuation message for the customer + segment.

    Round 3 (Cat 5): retorna agora chips/subtitle/primary_cta dos 5 novos
    kinds (viu_menu, chamou_garcom, abriu_pedido, pagou, voltou_sem_acao).
    Quando `kind` é null (default), cai no segment-based selection (vip
    vs regular, returning vs new) — mantém compat com chamadas antigas.
    """
    slots = {
        "customerName": req.customerName or "",
        "favoriteItem": req.favoriteItem or "",
        "tableLabel": req.tableLabel or "",
        "last_item": req.lastItem or req.favoriteItem or "",
        "managerName": req.managerName or "",
        "avgResponseMin": str(req.avgResponseMin) if req.avgResponseMin is not None else "",
        "waitMinutes": str(req.waitMinutes) if req.waitMinutes is not None else "",
        "lastOrderSummary": req.lastOrderSummary or "",
        "lastOrderId": req.lastOrderId or req.orderId or "",
        "orderId": req.orderId or req.lastOrderId or "",
    }
    full = get_continuation_full(
        tenant_id=req.tenantId,
        customer_ctx={
            "is_returning": req.isReturning,
            "is_vip": req.isVip,
            "customer_name": req.customerName or "",
            "favorite_item": req.favoriteItem or "",
        },
        kind=req.kind,
        slots=slots,
    )
    if not full:
        return ContinuationResponse(message=None, rendered=None)

    # `message` mantido por compat com callers antigos que esperam o doc
    # cru (template + slots). Novos consumidores usam chips/subtitle direto.
    return ContinuationResponse(
        message={
            "id": full["id"],
            "kind": full["kind"],
            "template": full["template"],
            "subtitle": full.get("subtitle"),
        },
        rendered=full["rendered"],
        chips=full.get("chips", []) or [],
        subtitle=full.get("subtitle"),
        primary_cta=full.get("primary_cta"),
    )


@app.get("/continuation")
async def continuation_get(
    tenantId: str,
    customerId: str | None = None,
    isReturning: bool = False,
    isVip: bool = False,
    customerName: str | None = None,
    kind: str | None = None,
    favoriteItem: str | None = None,
    lastOrderId: str | None = None,
    orderId: str | None = None,
):
    """GET variant for the apps/api home.service to call.

    Aceita `kind` query param pra forçar um dos 5 novos segments do
    canvas v20 (viu_menu, chamou_garcom, abriu_pedido, pagou,
    voltou_sem_acao). apps/api detecta o kind baseado em estado de DB
    (orders abertas, payments confirmados, waiter_calls inflight) e passa
    explicitamente — ai-service não consulta backend (não pode, sem
    api_client com tenant scoping).
    """
    slots = {
        "customerName": customerName or "",
        "tableLabel": "",
        "last_item": favoriteItem or "",
        "favoriteItem": favoriteItem or "",
        "lastOrderId": lastOrderId or orderId or "",
        "orderId": orderId or lastOrderId or "",
    }
    full = get_continuation_full(
        tenant_id=tenantId,
        customer_ctx={
            "is_returning": isReturning,
            "is_vip": isVip,
            "customer_name": customerName or "",
        },
        kind=kind,
        slots=slots,
    )
    if not full:
        return {"message": None, "rendered": None, "chips": [], "subtitle": None}
    return {
        "message": {
            "id": full["id"],
            "kind": full["kind"],
            "template": full["template"],
            "subtitle": full.get("subtitle"),
        },
        "rendered": full["rendered"],
        "chips": full.get("chips", []) or [],
        "subtitle": full.get("subtitle"),
        "primary_cta": full.get("primary_cta"),
    }


@app.post("/tools/dispatch", response_model=ToolDispatchResponse)
async def tools_dispatch(req: ToolDispatchRequest):
    """Server-side tool dispatcher exposed for orchestrators that don't run LLM tool-use natively."""
    staff_actor_id = req.staffId or req.waiterId
    ctx = ToolContext(
        tenant_id=req.tenantId,
        customer_id=req.customerId,
        session_id=req.sessionId,
        waiter_id=req.waiterId or req.staffId,
        is_staff=req.isStaff,
        is_manager=req.isManager,
        session_flags=req.sessionFlags or {},
        # P0 #7: inject the singleton api_client so tools that hit apps/api
        # (send_message_to_manager, request_table_merge, delete_chat, ...)
        # actually issue HTTP calls instead of seeing `None`.
        api_client=_context_api_client(req.tenantId, req.sessionId, staff_actor_id),
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

    if settings.LLM_COMPACT_PROMPT:
        prompt = f"""Você é o assistente virtual do restaurante "{restaurant_name}".
Responda em português do Brasil, em até 3 frases, apenas sobre restaurante, cardápio, pedidos, pagamento e atendimento.
Use function calls para intenções concretas: cardápio/menu, buscar prato, adicionar/remover item, ver/confirmar pedido, pagar/conta, chamar garçom, mensagem ao gerente, reclamação, juntar mesa, alérgenos, LGPD e histórico.
Nunca invente itens fora do cardápio; se faltar informação, consulte a equipe ou peça uma confirmação curta."""

        if categories:
            prompt += f"\n\nCATEGORIAS DO CARDÁPIO:\n{str(categories)[:600]}"
        if menu_summary:
            prompt += f"\n\nITENS DO CARDÁPIO:\n{str(menu_summary)[:1800]}"
        if customer_context:
            name = customer_context.get("name", "")
            if name:
                prompt += f"\n\nCLIENTE: {name}"
            pending_join = _pending_join_request(customer_context)
            if pending_join:
                joiner = pending_join.get("joinerName") or "um cliente"
                prompt += (
                    "\nPENDENCIA_DE_ENTRADA: "
                    f"{joiner} quer entrar na mesa. targetCustomerId={pending_join['targetCustomerId']}. "
                    "Se o host responder pode/sim/deixa entrar, chame accept_join_request. "
                    "Se responder não/agora não/recusar, chame reject_join_request."
                )
            if customer_context.get("is_vip"):
                prompt += "\nCliente VIP: tom mais atento."
            merge = customer_context.get("latest_table_merge") or {}
            if isinstance(merge, dict) and merge.get("status"):
                prompt += _merge_status_prompt_line(merge)
        return prompt

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
  do notice — ela é obrigatória pra captura de consentimento.

USO DE FERRAMENTAS (function calling · OBRIGATÓRIO em mutações):
- Você TEM ferramentas disponíveis (function calls). USE-AS sempre que o
  cliente expressar uma intenção concreta, em vez de só responder em texto.
- REGRA DE OURO: TODA mensagem que pede pra MUDAR ESTADO (adicionar item,
  cancelar, pagar, chamar garçom, mandar mensagem, juntar mesa, apagar
  dados) DEVE chamar uma function. Se você não chamar a function, o
  side-effect NÃO acontece — o cliente vai ficar olhando uma resposta
  bonita sem nada ter mudado no sistema.
- Mapeamento OBRIGATÓRIO de gatilhos:
  · "quero o X" / "me traz X" / "vou querer Y" / "1 risoto" / "pede X"
       → `add_to_order(itemId=<UUID do item>, quantity=<int 1-20>)`.
       NUNCA passe o NOME do prato em itemId — sempre o UUID. Quantity
       sempre o número que o cliente disse (default 1, NUNCA inventar 3).
       Se X for água/bebida que está no cardápio, também é pedido:
       "quero uma água" / "me traz uma água" → `add_to_order`, não `call_waiter`.
  · "ver cardápio" / "abre o menu" / "mostra o menu" → `view_menu`.
    Quando o cliente filtrar ("opções de bebida", "ver as sobremesas",
    "quais entradas tem"), passe `category` apropriadamente:
    "bebida"|"bebidas"|"drink"|"drinks" → `view_menu(category='bebida')`,
    "sobremesa"|"sobremesas"|"doce" → `view_menu(category='sobremesa')`,
    "entrada"|"entradas"|"aperitivo" → `view_menu(category='entrada')`,
    "prato"|"principal"|"refeição" → `view_menu(category='principal')`.
  · "vê meu pedido" / "o que tá no carrinho" / "mostra meu pedido"
       → `view_order`.
  · "quanto tempo demora o pedido?" / "cadê meu pedido?" / "status do pedido"
       → `view_order`. Isso é assunto do restaurante, NUNCA fora de escopo.
  · "tira o X" / "remove o X" → `remove_from_cart(itemId)`.
  · "muda o X pra Y unidades" / "altera quantidade" → `change_order(itemId, qty)`.
  · "cancela o pedido" → `cancel_order`.
  · "fechar a conta" / "trazer a conta" / "pedir conta" / "quero pagar"
    / "quero pagar a conta" → `open_payment_screen`. **NUNCA dispare
    `call_waiter` junto** — pagamento é flow self-service, não precisa
    garçom presente. Round 21 §H bug: LLM disparava `call_waiter` +
    `open_payment_screen` ao mesmo tempo, abrindo a sheet de chamar
    garçom em vez da tela de pagamento.
  · "quero pagar tudo" → `pay_full`. "minha parte" → `pay_individual`.
  · "dividir conta" → `split_bill`. Genérico de pagamento → `open_payment_screen`.
  · "chama o garçom" / "preciso de ajuda" / "chamar atendente" → `call_waiter`.
    **Só dispare CALL_WAITER quando o usuário pedir explicitamente o
    garçom** (atendimento presencial). NÃO dispare quando ele só quer
    pagar, pedir, adicionar água/bebida do cardápio, ou ver cardápio —
    essas têm tools próprias.
  · "junta com a mesa N" → `request_table_merge(targetTable=N)`.
    "juntar mesas" sem alvo claro → `request_table_merge()` para abrir o mapa.
  · Se houver PENDENCIA_DE_ENTRADA no contexto e o host responder
    "pode", "sim", "deixa entrar", "libera" ou equivalente
       → `accept_join_request(targetCustomerId=<UUID da pendência>)`.
    Se responder "não", "agora não", "recusar", "não pode" ou equivalente
       → `reject_join_request(targetCustomerId=<UUID da pendência>)`.
    NUNCA invente targetCustomerId: use somente o UUID da pendência no contexto.
  · "tem glúten?" / "é sem lactose?" / "tem alérgeno X?" → `check_allergens`.
  · "quero comparar X e Y" → `compare_dishes`.
  · "manda recado pro gerente" / "mensagem pra gerência" → se o texto já
    veio junto, `send_message_to_manager(text=…)`; se ainda falta o texto,
    peça a mensagem. No turno seguinte, envie o texto do cliente com
    `send_message_to_manager`, mesmo se ele mencionar frustração ou pedido.
  · "quero reclamar" / "abrir reclamação formal" → `send_complaint`.
    Use copy explícita de reclamação formal; não use "contar pra gerência"
    como rótulo solto. Não converta automaticamente uma mensagem pro gerente
    em reclamação formal.
  · "quero apagar dados" / "exclusão LGPD" → `show_lgpd_notice` PRIMEIRO.
  · "qual o horário?" / "endereço?" / "wi-fi?" → `ask_about_restaurant(topic=…)`.
- Quando chamar uma tool, NÃO repita o resultado em texto — o sistema renderiza
  a mensagem da tool. Responda em texto APENAS quando nenhuma tool se aplica
  (perguntas conceituais sobre comida, conversação, descrição de pratos).
- Se em dúvida entre texto vs tool em pedido de mutação, SEMPRE escolha a tool."""

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
        pending_join = _pending_join_request(customer_context)
        if pending_join:
            joiner = pending_join.get("joinerName") or "um cliente"
            prompt += (
                "\n\nPENDENCIA_DE_ENTRADA: "
                f"{joiner} quer entrar na mesa. targetCustomerId={pending_join['targetCustomerId']}. "
                "Use accept_join_request para respostas afirmativas e reject_join_request para respostas negativas."
            )
        merge = customer_context.get("latest_table_merge") or {}
        if isinstance(merge, dict) and merge.get("status"):
            prompt += _merge_status_prompt_line(merge)

    return prompt


def _merge_status_prompt_line(merge: dict) -> str:
    status = str(merge.get("status") or "")
    origin = merge.get("origin_table_number") or merge.get("originTableNumber") or "origem"
    target = merge.get("target_table_number") or merge.get("targetTableNumber") or "destino"
    approved_a = bool(merge.get("approved_by_a_at") or merge.get("approvedByAAt"))
    approved_b = bool(merge.get("approved_by_b_at") or merge.get("approvedByBAt"))
    if status == "approved":
        return (
            f"\n\nSTATUS DA JUNÇÃO DE MESAS: aprovado entre mesa {origin} e mesa {target}. "
            "Se o cliente perguntar se a outra mesa aceitou ou se as mesas já estão juntas, responda que sim, de forma curta. "
            "Não chame garçom, não abra cardápio e não chame nenhuma ferramenta para confirmar esse status."
        )
    if status == "pending":
        if approved_a and not approved_b:
            detail = "a mesa de origem já confirmou; falta a outra mesa confirmar"
        elif approved_b and not approved_a:
            detail = "a outra mesa já confirmou; falta o host da mesa de origem confirmar"
        else:
            detail = "ainda falta confirmação dos hosts"
        return (
            f"\n\nSTATUS DA JUNÇÃO DE MESAS: pendente entre mesa {origin} e mesa {target}; {detail}. "
            "Se o cliente perguntar sobre a junção, explique esse status em texto. Não chame garçom nem nenhuma ferramenta para confirmar esse status."
        )
    if status == "rejected":
        return (
            f"\n\nSTATUS DA JUNÇÃO DE MESAS: recusado entre mesa {origin} e mesa {target}. "
            "Se o cliente perguntar sobre a junção, diga que não foi aprovada."
        )
    return (
        f"\n\nSTATUS DA JUNÇÃO DE MESAS: {status} entre mesa {origin} e mesa {target}. "
        "Use esse status se o cliente perguntar sobre a junção."
    )
