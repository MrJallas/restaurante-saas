"""Assign a waiter call to a specific staff member. Silent dispatch."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    call_id = args.get("callId") or args.get("call_id")
    assignee_id = args.get("assigneeId") or args.get("assignee_id")

    if not call_id or not assignee_id:
        return ToolResult(error={"code": "bad_args"})

    if ctx.api_client:
        try:
            ctx.api_client("POST", f"/waiter-calls/{call_id}/assign", {"assigneeId": assignee_id})
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(silent=True, action_payload={"callId": call_id, "assigneeId": assignee_id})
