"""Mark a waiter call as resolved."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    call_id = args.get("callId") or args.get("call_id")
    if not call_id:
        return ToolResult(error={"code": "missing_call_id"})

    if ctx.api_client:
        try:
            ctx.api_client("POST", f"/waiter-calls/{call_id}/resolve", {
                "resolvedBy": ctx.waiter_id,
                "note": args.get("note"),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message="Chamado resolvido.")
