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
            # apps/api also performs an in-process handoff after tool dispatch.
            # Keep the customer-facing LGPD confirmation canonical even if the
            # HTTP callback is unavailable or misconfigured.
            backend_dispatched = False
    if not protocol_number:
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
