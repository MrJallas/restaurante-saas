"""Reply to a complaint thread. Requires text body."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    text = args["text"].strip()
    complaint_id = args.get("complaintId") or args.get("complaint_id")
    if not complaint_id:
        return ToolResult(error={"code": "missing_complaint_id"})

    if ctx.api_client:
        try:
            ctx.api_client("POST", f"/complaints/{complaint_id}/respond", {
                "content": text,
                "chipAction": args.get("chipAction") or args.get("chip_action"),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message="Resposta enviada.")
