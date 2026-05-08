"""
Delete all chat threads for the customer (mass delete · 30d window).

Per `chat-history-lgpd.md` — bulk delete of every NoSQL thread tied to
`customerId`. Different from `lgpd_data_request(type='erasure')` because:
  - This is the UI-driven mass delete (no LGPD protocol number minted)
  - LGPD request includes the formal protocol + audit trail

Hits `DELETE /customer/chats` (no path param). Backend cascades to all
threads + messages.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.customer_id:
        return ToolResult(
            message="Pra apagar suas conversas, preciso te identificar primeiro.",
            silent=True,
        )

    deleted_count = 0
    if ctx.api_client:
        try:
            res = ctx.api_client("DELETE", "/customer/chats", None) or {}
            deleted_count = res.get("deletedCount", 0)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message=(
            f"Apaguei suas {deleted_count} conversa(s). "
            "Não tem volta — nem pra você nem pra mim."
            if deleted_count
            else "Apaguei todo o histórico de conversas."
        ),
        action_payload={"deletedCount": deleted_count},
    )
