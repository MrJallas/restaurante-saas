"""Accept a pending table participant join request.

The customer session cookie only exists in the browser/app API boundary. This
tool must not fake an authenticated server-side decision; it returns an action
payload for web-customer to execute through `/table/participants/decide`.
"""

from typing import Any

from .types import ToolContext, ToolResult


def _followup_chips() -> list[dict[str, Any]]:
    return [
        {
            "id": "join-view-table",
            "label": "Ver quem está na mesa",
            "action": "send",
            "payload": "ver quem está na mesa",
        },
        {
            "id": "join-call-waiter",
            "label": "Chamar garçom",
            "action": "send",
            "payload": "chamar garçom",
        },
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    target_customer_id = str(args.get("targetCustomerId") or "").strip()
    reason = str(args.get("reason") or ctx.raw_message or "").strip()

    if not target_customer_id:
        return ToolResult(
            message="Não encontrei o pedido de entrada pendente para aprovar.",
            error={"code": "missing_target_customer_id"},
            chips=[
                {
                    "id": "join-view-table",
                    "label": "Ver quem está na mesa",
                    "action": "send",
                    "payload": "ver quem está na mesa",
                }
            ],
        )

    return ToolResult(
        message="Pode deixar, vou liberar a entrada na mesa.",
        chips=_followup_chips(),
        action_payload={
            "action": "decide_join_request",
            "decision": "approve",
            "targetCustomerId": target_customer_id,
            "reason": reason or None,
        },
    )
