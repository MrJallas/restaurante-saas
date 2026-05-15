"""
Show the customer's current pending order (cart contents · pre-confirm).

Router-style tool — FE swaps to ScreenCustomerOrderReview. The LLM
typically calls this when the customer says "vê meu pedido", "o que tá no
carrinho", etc.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # Chips canônicos pós-view_order: pedir mais, modificar (volta pro
    # carrinho/menu), pedir conta. Spec round 3 K-9.
    chips = [
        {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero adicionar mais alguma coisa"},
        {"id": "modify", "label": "Modificar", "action": "send", "payload": "quero mudar meu pedido"},
        {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
    ]

    return ToolResult(
        message="Claro, vou mostrar seu pedido.",
        chips=chips,
        router_target="ScreenCustomerOrderReview",
        action_payload={"showDraftOrder": True, "clientState": True},
    )
