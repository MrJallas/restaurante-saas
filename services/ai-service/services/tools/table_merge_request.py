"""
DEPRECATED — remove next round.

Legacy alias for `request_table_merge`. The canonical name per F2 spec is
`request_table_merge`; existing callers still reference
`table_merge_request`, so this thin wrapper forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .request_table_merge import call as _request_table_merge_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `request_table_merge`."""
    return _request_table_merge_call(args, ctx)
