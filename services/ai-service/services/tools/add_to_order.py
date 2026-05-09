"""
Add an item to the customer's pending order (canonical name per F2 spec).

Renamed from `add_to_cart` — same semantics. The legacy `add_to_cart`
forwarding module was removed in P1 #30.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id")
    quantity = int(args.get("quantity") or 1)
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "itemId obrigatório"})

    payload = {"itemId": item_id, "quantity": quantity, "notes": args.get("notes")}
    if ctx.api_client:
        try:
            ctx.api_client("POST", "/customer/cart/items", payload)
        except Exception as e:  # network errors propagate as soft errors
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message=f"Adicionei {quantity}x ao seu pedido. Quer mais alguma coisa?",
        action_payload={"orderUpdated": True, "itemId": item_id, "quantity": quantity},
    )
