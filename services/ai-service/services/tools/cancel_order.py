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

    return ToolResult(
        message="Vou limpar esse pedido por aqui. Sem problema.",
        chips=_chips_after_cancel(),
        action_payload={"orderCancelled": True, "clearDraftOrder": True, "orderId": order_id},
    )
