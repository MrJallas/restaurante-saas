"""Manager ends a zone-pause early."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    pause_id = args.get("pauseId") or args.get("pause_id")
    if not pause_id:
        return ToolResult(error={"code": "missing_pause_id"})

    if ctx.api_client:
        try:
            ctx.api_client("DELETE", f"/staff/zone-pauses/{pause_id}", {"reason": args.get("reason")})
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(message="Zona despausada.")
