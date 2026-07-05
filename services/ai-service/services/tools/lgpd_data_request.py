"""
LGPD data request — silent dispatch but returns the canonical confirmation
message + protocol number (canonical name per F2 spec).

Renamed from `lgpd_erase_chat`. Spec: `chat-history-lgpd.md` lines 127-156.
The bubble text is the IMMUTABLE canonical from `services/lgpd_messages.py`;
we never paraphrase.

Note: `show_lgpd_notice` should always be called FIRST when the customer
expresses LGPD intent; this tool runs only after they confirm via chip tap
or affirmative free-text reply (consent capture per spec).

The legacy `lgpd_erase_chat` forwarding module was removed in P1 #30.
"""

from typing import Any
from datetime import datetime, timezone

from ..lgpd_messages import (
    LGPD_ERASURE_CONFIRMATION,
    LGPD_REQUIRES_LOGIN,
)
from .types import ToolContext, ToolResult


# Honest copy for the failure path. NOT canonical LGPD text (that lives in
# `lgpd_messages.py` and only applies when the erasure actually happened) —
# this must never affirm that the data was deleted, because it wasn't.
LGPD_ERASURE_PENDING: str = (
    "Registrei sua solicitação de exclusão, mas ainda não consegui confirmar "
    "com o sistema que seus dados foram apagados. Nossa equipe vai concluir a "
    "exclusão e você recebe a confirmação aqui. Se preferir, tente de novo em "
    "instantes."
)


def _make_protocol() -> str:
    """Format AAAA-MM-DD-XXXX per spec line 136."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Random-ish suffix using high-resolution time. Real backend mints this.
    suffix = format(int(datetime.now(timezone.utc).timestamp() * 1000) & 0xFFFF, "04X")
    return f"LGPD-{today}-{suffix}"


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.customer_id:
        # Anonymous session — guide them to login per spec edge case.
        return ToolResult(message=LGPD_REQUIRES_LOGIN, silent=True)

    # `type` defaults to 'erasure' for backward-compat with the original
    # `lgpd_erase_chat` callers; spec also allows 'access' and 'portability'
    # but only 'erasure' is wired in this round.
    request_type = args.get("type") or "erasure"
    request_kind = "erasure" if request_type == "erasure" else "export"

    protocol_number = None
    backend_dispatched = False
    backend_failed = False
    backend_called = bool(ctx.api_client)
    if ctx.api_client:
        try:
            res = ctx.api_client("POST", f"/{ctx.tenant_id}/lgpd-requests", {
                "kind": request_kind,
                "consentMethod": args.get("consentMethod", "free_text"),
                "originalMessage": ctx.raw_message,
                "chipLabel": args.get("chipLabel"),
                "notes": f"assistant lgpd_data_request type={request_type}",
            })
            protocol_number = (res or {}).get("protocolNumber")
            backend_dispatched = bool(protocol_number)
        except Exception:
            # A09 fix: when the backend call FAILS we must NOT fabricate
            # success. The old code swallowed the exception and still returned
            # the canonical "seus dados foram apagados" + status='fulfilled' —
            # lying to the customer while nothing was deleted. Flag the failure
            # and fall through to an honest pending/error result below.
            backend_failed = True

    if backend_failed or (backend_called and not protocol_number):
        # Backend errou (exceção) OU respondeu mas SEM protocolNumber (violação de
        # contrato — 200 vazio). Nos dois casos NÃO afirmamos apagamento nem
        # mintamos protocolo: só um backend que devolveu um protocolo confirma a
        # erasure. (Só o handoff SEM api_client abaixo minta legitimamente.)
        return ToolResult(
            message=LGPD_ERASURE_PENDING,
            silent=True,
            chips=[
                {"id": "back_to_chat", "label": "Voltar ao chat", "action": "navigate", "payload": "assistente"},
                {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
            ],
            action_payload={
                "lgpdErasure": {
                    "protocolNumber": None,
                    "status": "pending",
                    "requestedAt": datetime.now(timezone.utc).isoformat(),
                    "type": request_type,
                    "backendDispatched": False,
                }
            },
        )

    if not protocol_number:
        # Só chega aqui com backend_called == False: SEM api_client (dispatch puro
        # in-process) — o apps/api completa a erasure out-of-band após o dispatch,
        # então o protocolo mintado aqui é o esperado. NÃO é falha de backend nem
        # 200-sem-protocolo (esses já retornaram pending acima).
        protocol_number = _make_protocol()

    # Canonical text — DO NOT paraphrase. Tests assert byte-equality.
    # Round 4 §C-NEW-3 — chips: continuar conversando ou voltar.
    return ToolResult(
        message=LGPD_ERASURE_CONFIRMATION,
        silent=True,  # FE doesn't show ToolCallIndicator for LGPD
        chips=[
            {"id": "back_to_chat", "label": "Voltar ao chat", "action": "navigate", "payload": "assistente"},
            {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
        ],
        action_payload={
            "lgpdErasure": {
                "protocolNumber": protocol_number,
                "status": "fulfilled",
                "executedAt": datetime.now(timezone.utc).isoformat(),
                "type": request_type,
                "backendDispatched": backend_dispatched,
            }
        },
    )
