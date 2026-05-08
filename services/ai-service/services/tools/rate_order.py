"""Router tool — jumps to ScreenCustomerOrderRating."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Te mando pra tela de avaliação — leva 30 segundos.",
        router_target="ScreenCustomerOrderRating",
        action_payload={"orderId": args.get("orderId") or args.get("order_id")},
    )
