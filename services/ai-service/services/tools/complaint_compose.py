"""
DEPRECATED — remove next round.

Legacy alias for `send_complaint`. The canonical name per F2 spec is
`send_complaint`; existing callers still reference `complaint_compose`,
so this thin wrapper forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .send_complaint import call as _send_complaint_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `send_complaint`."""
    return _send_complaint_call(args, ctx)
