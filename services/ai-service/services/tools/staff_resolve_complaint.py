"""Mark a complaint as resolved (with optional compensation note)."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    complaint_id = args.get("complaintId") or args.get("complaint_id")
    if not complaint_id:
        return ToolResult(error={"code": "missing_complaint_id"})

    compensation = args.get("compensation")  # e.g. {kind: 'discount', amountCents: 1500}

    if ctx.api_client:
        try:
            ctx.api_client("POST", f"/staff/complaints/{complaint_id}/resolve", {
                "resolvedBy": ctx.waiter_id,
                "compensation": compensation,
                "note": args.get("note"),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message="Reclamação resolvida.")
