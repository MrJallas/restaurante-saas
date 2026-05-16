"""Remove an item from the pending cart."""

from typing import Any
from .types import ToolContext, ToolResult


def _chips_after_remove() -> list[dict[str, Any]]:
    """Round 4 §C-NEW-3 — após remover, próxima coisa é ver/pedir mais/conta."""
    return [
        {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
        {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
        {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id")
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "itemId obrigatório"})

    return ToolResult(
        message="Vou atualizar seu pedido. Algo mais?",
        chips=_chips_after_remove(),
        action_payload={"cartUpdated": True, "removedItemId": item_id, "itemId": item_id},
    )
