"""Confirm and submit the pending cart as an order."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if ctx.api_client:
        try:
            res = ctx.api_client("POST", "/customer/orders/confirm", {})
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    else:
        res = {"orderId": None}

    # Zone pause: keep the customer-facing copy silent about the queue —
    # spec says the pause is silent on the customer side.
    return ToolResult(
        message="Pedido confirmado. Já mando pra cozinha!",
        action_payload={"order": res},
    )
