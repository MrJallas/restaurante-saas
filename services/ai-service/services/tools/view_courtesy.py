"""
Show courtesy items the customer has on the table (compensations / brindes).

Per `complaint-flow-v12.md` the manager can send a courtesy compensation
after a complaint; this tool surfaces those items so the customer sees
them as part of the order without confusing them with paid items.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.api_client:
        return ToolResult(
            message="Não consegui consultar agora. Posso chamar o garçom?",
            action_payload={"status": "not_implemented", "tool": "view_courtesy"},
        )

    courtesies: list[dict] = []
    try:
        res = ctx.api_client("GET", "/customer/courtesy", None) or {}
        courtesies = res.get("items") or []
    except Exception as e:
        return ToolResult(error={"code": "api_error", "message": str(e)})

    if not courtesies:
        return ToolResult(message="Não tem cortesia na sua mesa agora.")

    lines = [f"- {c.get('name')}" for c in courtesies]
    return ToolResult(
        message="Cortesias que tão pra você:\n" + "\n".join(lines),
        action_payload={"items": courtesies},
    )
