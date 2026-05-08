"""
Manager pauses zone (waiter's tables). Requires text reason per spec.

Spec: `zone-pause.md` — `reason?` is OPTIONAL in the API but our tool guard
mandates it for accountability of the LLM-mediated path.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    text = args["text"].strip()  # mandated by dispatcher
    waiter_id = args.get("waiterId") or args.get("waiter_id")
    duration = int(args.get("durationMinutes") or 5)

    if not waiter_id:
        return ToolResult(error={"code": "missing_waiter"})

    if duration not in (5, 10, 15, 30):
        duration = 5

    if ctx.api_client:
        try:
            res = ctx.api_client("POST", "/staff/zone-pauses", {
                "waiterId": waiter_id,
                "durationMinutes": duration,
                "reason": text,
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    else:
        res = {}

    return ToolResult(
        message=f"Zona pausada por {duration} min — motivo: {text}",
        action_payload={"zonePause": res},
    )
