"""Cancel an order (only valid before it's confirmed by the kitchen)."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    order_id = args.get("orderId") or args.get("order_id")
    if not order_id:
        return ToolResult(error={"code": "missing_order", "message": "qual pedido?"})

    if ctx.api_client:
        try:
            ctx.api_client("DELETE", f"/customer/orders/{order_id}", None)
        except Exception as e:
            status = getattr(e, "status_code", None)
            if status == 409:
                return ToolResult(message="Esse pedido já tá saindo da cozinha — não dá mais pra cancelar. Quer falar com o garçom?")
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Cancelado. Sem problema.",
        action_payload={"orderCancelled": True, "orderId": order_id},
    )
