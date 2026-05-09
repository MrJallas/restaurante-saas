"""
Open the generic payment screen.

Router-style tool — FE swaps to ScreenCustomerPayment, the entry point that
lets the customer pick split-bill / individual / full. Use this when the
LLM hasn't yet decided which payment flavour the customer wants.

TODO: wire up payment provider integration.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Abro a tela de pagamento pra você.",
        chips=[
            {"id": "pay_full", "label": "Pagar tudo", "action": "send", "payload": "quero pagar a conta toda"},
            {"id": "pay_individual", "label": "Pagar minha parte", "action": "send", "payload": "quero pagar só a minha parte"},
            {"id": "split", "label": "Dividir conta", "action": "send", "payload": "quero dividir a conta"},
        ],
        router_target="ScreenCustomerPayment",
        action_payload={
            "status": "not_implemented",
            "tool": "open_payment_screen",
        },
    )
