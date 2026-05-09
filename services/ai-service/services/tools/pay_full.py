"""
Full table payment — pay the entire table bill.

Router-style tool — FE swaps to ScreenCustomerPayFull. The customer
takes the full check; useful for hosts treating the table.

TODO: wire up server-side payment intent when payment provider is integrated.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    chips = [
        {"id": "pay_pix", "label": "Pagar com PIX", "action": "send", "payload": "quero pagar com pix"},
        {"id": "pay_card", "label": "Trocar pra cartão", "action": "send", "payload": "quero pagar com cartão"},
        {"id": "split", "label": "Dividir conta", "action": "send", "payload": "quero dividir a conta"},
    ]
    return ToolResult(
        message="Abro a tela pra você pagar a conta toda da mesa.",
        chips=chips,
        router_target="ScreenCustomerPayFull",
        action_payload={
            "status": "not_implemented",
            "tool": "pay_full",
        },
    )
