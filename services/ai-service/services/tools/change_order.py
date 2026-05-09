"""Modify a pending order (only if not yet sent to kitchen)."""

from typing import Any
from .types import ToolContext, ToolResult


def _chips_after_change() -> list[dict[str, Any]]:
    """Round 4 §C-NEW-3 — chips canônicos pós-mudança em pedido."""
    return [
        {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
        {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
        {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    order_id = args.get("orderId") or args.get("order_id")
    changes = args.get("changes")  # {addItems?, removeItems?, notes?}
    if not order_id or not changes:
        return ToolResult(error={"code": "bad_args", "message": "preciso do pedido + mudanças"})

    if ctx.api_client:
        try:
            res = ctx.api_client("PATCH", f"/customer/orders/{order_id}", changes)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    else:
        res = {}

    return ToolResult(
        message="Atualizei seu pedido. Confere aí.",
        chips=_chips_after_change(),
        action_payload={"order": res},
    )
