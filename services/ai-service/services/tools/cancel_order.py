"""Cancel an order (only valid before it's confirmed by the kitchen)."""

from typing import Any
from .types import ToolContext, ToolResult


def _chips_after_cancel() -> list[dict[str, Any]]:
    """Round 4 §C-NEW-3 — após cancelar pedido, restart típico do flow."""
    return [
        {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
        {"id": "recommend", "label": "Me recomenda algo", "action": "send", "payload": "o que você recomenda?"},
        {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
    ]


def _chips_too_late_to_cancel() -> list[dict[str, Any]]:
    """Quando 409 (cozinha já tá com o pedido), só faz sentido escalar."""
    return [
        {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
        {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
    ]


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
                return ToolResult(
                    message="Esse pedido já tá saindo da cozinha — não dá mais pra cancelar. Quer falar com o garçom?",
                    chips=_chips_too_late_to_cancel(),
                )
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Cancelado. Sem problema.",
        chips=_chips_after_cancel(),
        action_payload={"orderCancelled": True, "orderId": order_id},
    )
