"""
DEPRECATED — remove next round.

Legacy alias for `recommend_dish`. The canonical tool name per F2 spec is
`recommend_dish`; existing call sites (apps/api dispatcher, older client
code) still reference `recommend`, so we keep this thin wrapper that
forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .recommend_dish import call as _recommend_dish_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `recommend_dish`."""
    return _recommend_dish_call(args, ctx)
