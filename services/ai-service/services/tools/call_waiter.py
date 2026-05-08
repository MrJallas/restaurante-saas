"""Open a waiter call. Honours zone-pause (silent absorb)."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    reason = args.get("reason", "geral")

    if ctx.api_client:
        try:
            ctx.api_client("POST", "/waiter-calls", {
                "sessionId": ctx.session_id,
                "reason": reason,
                "isVip": bool(ctx.session_flags.get("is_vip")),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    # If the zone is paused (server-side ETA includes pause), the customer
    # still gets a normal acknowledgment — spec says zone pause is silent.
    return ToolResult(
        message="Chamei o garçom — vai estar com você logo.",
        action_payload={"waiterCalled": True, "reason": reason},
    )
