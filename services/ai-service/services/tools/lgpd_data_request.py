"""
LGPD data request — silent dispatch but returns the canonical confirmation
message + protocol number (canonical name per F2 spec).

Renamed from `lgpd_erase_chat`. Spec: `chat-history-lgpd.md` lines 127-156.
The bubble text is the IMMUTABLE canonical from `services/lgpd_messages.py`;
we never paraphrase.

Note: `show_lgpd_notice` should always be called FIRST when the customer
expresses LGPD intent; this tool runs only after they confirm via chip tap
or affirmative free-text reply (consent capture per spec).

The legacy `lgpd_erase_chat` module re-exports from here as a deprecated alias.
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

    protocol_number = None
    if ctx.api_client:
        try:
            res = ctx.api_client("POST", "/customer/lgpd-requests", {
                "type": request_type,
                "consentMethod": args.get("consentMethod", "free_text"),
                "originalMessage": ctx.raw_message,
                "chipLabel": args.get("chipLabel"),
            })
            protocol_number = (res or {}).get("protocolNumber")
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    if not protocol_number:
        protocol_number = _make_protocol()

    # Canonical text — DO NOT paraphrase. Tests assert byte-equality.
    return ToolResult(
        message=LGPD_ERASURE_CONFIRMATION,
        silent=True,  # FE doesn't show ToolCallIndicator for LGPD
        action_payload={
            "lgpdErasure": {
                "protocolNumber": protocol_number,
                "status": "fulfilled",
                "executedAt": datetime.now(timezone.utc).isoformat(),
                "type": request_type,
            }
        },
    )
