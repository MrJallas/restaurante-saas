"""
Show the customer's current pending order (cart contents · pre-confirm).

Router-style tool — FE swaps to ScreenCustomerOrderReview. The LLM
typically calls this when the customer says "vê meu pedido", "o que tá no
carrinho", etc.
"""

import re
from typing import Any
from .types import ToolContext, ToolResult

_CHANGE_ORDER_RE = re.compile(r"\b(mudar|modificar|alterar|trocar|ajustar)\b.*\b(pedido|item|prato|bebida)\b", re.IGNORECASE)
_ORDER_STATUS_RE = re.compile(
    r"\b(quanto\s+tempo|demora|vai\s+demorar|cad[eê]|status|andamento|previs[aã]o|quando)\b.*\b(pedido|comida|prato|cozinha)\b|"
    r"\b(pedido|comida|prato|cozinha)\b.*\b(quanto\s+tempo|demora|vai\s+demorar|cad[eê]|status|andamento|previs[aã]o|quando)\b",
    re.IGNORECASE,
)


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # Chips canônicos pós-view_order: pedir mais, modificar (volta pro
    # carrinho/menu), pedir conta. Spec round 3 K-9.
    chips = [
        {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero adicionar mais alguma coisa"},
        {"id": "modify", "label": "Modificar", "action": "send", "payload": "quero mudar meu pedido"},
        {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
    ]

    raw = ctx.raw_message or ""
    if _CHANGE_ORDER_RE.search(raw):
        message = "Vou abrir seu pedido para você ajustar."
    elif _ORDER_STATUS_RE.search(raw):
        message = "Vou mostrar seu pedido e o status dele."
    else:
        message = "Claro, vou mostrar seu pedido."

    return ToolResult(
        message=message,
        chips=chips,
        router_target="ScreenCustomerOrderReview",
        action_payload={"showDraftOrder": True, "clientState": True},
    )
