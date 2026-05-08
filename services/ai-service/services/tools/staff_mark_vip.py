"""
Manager marks a session as VIP. Per `vip-customer.md` it's session-scoped,
not a permanent customer attribute.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.is_manager:
        return ToolResult(error={"code": "forbidden", "message": "só manager"})

    session_id = args.get("sessionId") or args.get("session_id") or ctx.session_id
    if not session_id:
        return ToolResult(error={"code": "missing_session_id"})

    if ctx.api_client:
        try:
            ctx.api_client("POST", f"/staff/sessions/{session_id}/flags", {
                "flag": "vip",
                "action": "add",
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message="VIP marcado pra essa sessão.")
