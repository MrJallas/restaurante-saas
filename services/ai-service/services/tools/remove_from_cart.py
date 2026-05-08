"""Remove an item from the pending cart."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id")
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "itemId obrigatório"})

    if ctx.api_client:
        try:
            ctx.api_client("DELETE", f"/customer/cart/items/{item_id}", None)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Removi do pedido. Algo mais?",
        action_payload={"cartUpdated": True, "removedItemId": item_id},
    )
