"""
Open the split-bill flow.

Router-style tool — FE swaps to ScreenCustomerSplitBill. Optional `mode`
hints the default split style (per-item, equal-share, custom).

TODO: integrate with payment provider when wired; for now this is a
navigation hint.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    mode = args.get("mode")  # 'equal' | 'per-item' | 'custom'
    return ToolResult(
        message="Te levo pra tela de dividir a conta.",
        chips=[
            {"id": "equal", "label": "Em partes iguais", "action": "send", "payload": "divide igual entre todos"},
            {"id": "by_item", "label": "Cada um o que pediu", "action": "send", "payload": "cada um paga o que pediu"},
            {"id": "custom", "label": "Custom", "action": "send", "payload": "quero personalizar a divisão"},
        ],
        router_target="ScreenCustomerSplitBill",
        action_payload={
            "mode": mode,
            "status": "not_implemented",
            "tool": "split_bill",
        },
    )
