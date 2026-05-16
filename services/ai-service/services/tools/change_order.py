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
    item_id = args.get("itemId") or args.get("item_id")
    changes = args.get("changes") or {}

    if not isinstance(changes, dict):
        return ToolResult(error={"code": "bad_args", "message": "changes precisa ser um objeto"})

    quantity = args.get("quantity") or args.get("qty")
    notes = args.get("notes") or args.get("note")
    if quantity is not None:
        changes["quantity"] = quantity
    if notes is not None:
        changes["notes"] = notes

    if not order_id and not item_id:
        return ToolResult(error={"code": "bad_args", "message": "preciso do item/pedido + mudanças"})
    if not changes:
        return ToolResult(error={"code": "bad_args", "message": "preciso das mudanças"})

    return ToolResult(
        message="Vou ajustar seu pedido. Confere aí.",
        chips=_chips_after_change(),
        action_payload={
            "cartUpdated": True,
            "orderId": order_id,
            "itemId": item_id,
            "changes": changes,
        },
    )
