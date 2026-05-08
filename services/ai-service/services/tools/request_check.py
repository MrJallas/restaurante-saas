"""Customer asks for the bill (`pediu_a_conta`)."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if ctx.api_client:
        try:
            ctx.api_client("POST", "/customer/check-requests", {
                "sessionId": ctx.session_id,
                "splitMode": args.get("splitMode", "single"),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Pedi a conta pro garçom — já já chega na sua mesa.",
        action_payload={"checkRequested": True},
    )
