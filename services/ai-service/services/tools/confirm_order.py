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
    # Round 4 §C-NEW-3 — chips típicos pós-confirm.
    return ToolResult(
        message="Pedido confirmado. Já mando pra cozinha!",
        chips=[
            {"id": "view_order", "label": "Acompanhar pedido", "action": "navigate", "payload": "pedido"},
            {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
            {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
        ],
        action_payload={"order": res},
    )
