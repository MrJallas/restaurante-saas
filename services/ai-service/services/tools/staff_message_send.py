"""Manager → customer (or staff → customer) direct message. Requires text."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # `text` non-empty is enforced by the dispatcher (STAFF_TOOLS_REQUIRING_TEXT).
    text = args["text"].strip()
    target_session_id = args.get("sessionId")

    if ctx.api_client:
        try:
            ctx.api_client("POST", "/staff/messages", {
                "fromStaffId": ctx.waiter_id,
                "toSessionId": target_session_id,
                "text": text,
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Mensagem enviada.",
        action_payload={"messageSent": True, "toSessionId": target_session_id},
    )
