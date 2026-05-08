"""Manager broadcast to all active sessions. Requires text."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    text = args["text"].strip()
    audience = args.get("audience", "all")  # 'all' | 'staff' | 'customers'

    if ctx.api_client:
        try:
            ctx.api_client("POST", "/staff/broadcasts", {
                "fromStaffId": ctx.waiter_id,
                "audience": audience,
                "text": text,
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message=f"Broadcast enviado pra {audience}.")
