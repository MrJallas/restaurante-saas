"""
DEPRECATED — remove next round.

Legacy alias for `add_to_order`. The canonical tool name per F2 spec is
`add_to_order`; existing callers still reference `add_to_cart`, so this
thin wrapper forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .add_to_order import call as _add_to_order_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `add_to_order`."""
    return _add_to_order_call(args, ctx)
