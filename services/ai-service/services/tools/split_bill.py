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
        router_target="ScreenCustomerSplitBill",
        action_payload={
            "mode": mode,
            "status": "not_implemented",
            "tool": "split_bill",
        },
    )
