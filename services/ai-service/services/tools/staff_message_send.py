"""
DEPRECATED — remove next round.

Legacy alias for `send_message_to_manager`. Existing callers and the staff
side LLM tool inventory still reference `staff_message_send`; this thin
wrapper forwards to the new module.
"""

from typing import Any
from .types import ToolContext, ToolResult
from .send_message_to_manager import call as _send_message_to_manager_call


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """DEPRECATED — remove next round. Forwards to `send_message_to_manager`."""
    return _send_message_to_manager_call(args, ctx)
