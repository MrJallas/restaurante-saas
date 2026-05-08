"""
DEPRECATED — remove next round.

Legacy alias for `rate_visit`. The canonical name per F2 spec is `rate_visit`;
existing callers still reference `rate_order`, so this thin wrapper forwards
to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .rate_visit import call as _rate_visit_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `rate_visit`."""
    return _rate_visit_call(args, ctx)
