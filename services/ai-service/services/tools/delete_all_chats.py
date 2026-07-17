"""
Request deletion of all chat threads for the customer (30d window).

Per `chat-history-lgpd.md` — bulk delete of every NoSQL thread tied to
`customerId`. Different from `lgpd_data_request(type='erasure')` because:
  - This is the UI-driven mass delete (no LGPD protocol number minted)
  - LGPD request includes the formal protocol + audit trail

The confirmed chip is executed by web-customer against apps/api using the
browser's httpOnly recognition_token cookie. The AI service only describes
the action; customerId in its context is not an authorization credential.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.customer_id:
        return ToolResult(
            message="Pra apagar suas conversas, preciso te identificar primeiro.",
            silent=True,
        )

    # Defense in depth: this process cannot prove the browser identity. The
    # frontend already consumes the out-of-band confirm chip and performs the
    # DELETE, then renders the canonical success/error message from the real
    # response. Never claim deletion from here.
    return ToolResult(
        silent=True,
        action_payload={
            "action": "delete_all_chats_in_browser",
            "requiresRecognitionCookie": True,
        },
    )
