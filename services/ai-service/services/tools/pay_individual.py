"""
Individual payment — pay only the customer's own portion.

Router-style tool — FE swaps to ScreenCustomerPayIndividual. The split-bill
math is done server-side; this just opens the screen with the customer's
share pre-computed.

TODO: wire up server-side payment intent when payment provider is integrated.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Abro a tela pra você pagar só a sua parte.",
        chips=[
            {"id": "pay_pix", "label": "Pagar com PIX", "action": "send", "payload": "quero pagar minha parte com pix"},
            {"id": "pay_card", "label": "Pagar com cartão", "action": "send", "payload": "quero pagar minha parte com cartão"},
            {"id": "pay_full", "label": "Pagar tudo", "action": "send", "payload": "quero pagar a conta toda"},
        ],
        router_target="ScreenCustomerPayIndividual",
        action_payload={
            "status": "not_implemented",
            "tool": "pay_individual",
        },
    )
