"""Reject a pending table participant join request.

The authenticated decision is executed by web-customer with the browser
session. The AI service only returns the intended action payload.
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
            message="Não encontrei o pedido de entrada pendente para recusar.",
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
        message="Tudo bem, vou avisar que agora não dá para entrar.",
        chips=_followup_chips(),
        action_payload={
            "action": "decide_join_request",
            "decision": "reject",
            "targetCustomerId": target_customer_id,
            "reason": reason or None,
        },
    )
