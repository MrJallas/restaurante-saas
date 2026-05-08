"""
DEPRECATED — remove next round.

Legacy alias for `lgpd_data_request`. The canonical name per F2 spec is
`lgpd_data_request`; existing callers still reference `lgpd_erase_chat`,
so this thin wrapper forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .lgpd_data_request import call as _lgpd_data_request_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `lgpd_data_request`."""
    return _lgpd_data_request_call(args, ctx)
