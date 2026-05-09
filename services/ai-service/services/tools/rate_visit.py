"""
Rate the visit (canonical name per F2 spec).

Renamed from `rate_order`. Spec uses "rate_visit" since the rating refers
to the broader visit experience (multiple orders per session). The legacy
`rate_order` forwarding module was removed in P1 #30.

Router-style tool — FE swaps to ScreenCustomerOrderRating (the route is
unchanged from the v12 complaint flow even though the tool name moved).
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Te mando pra tela de avaliação — leva 30 segundos.",
        router_target="ScreenCustomerOrderRating",
        action_payload={"orderId": args.get("orderId") or args.get("order_id")},
    )
