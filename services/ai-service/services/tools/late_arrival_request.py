"""
Late-arrival request (cliente B chega depois do A na mesma mesa).

Per `customer-host-model.md` lines 133+. Tool creates a LateArrivalRequest
and waits for host approval — the message rendered to customer B is the
"esperando confirmação" copy.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    target_table = args.get("targetTable") or args.get("target_table")
    requested_name = args.get("requestedName") or args.get("requested_name")

    if not target_table:
        return ToolResult(error={
            "code": "missing_target_table",
            "message": "qual mesa você está chegando para se juntar?",
        })

    if ctx.api_client:
        try:
            res = ctx.api_client("POST", "/customer/late-arrivals", {
                "targetTable": target_table,
                "requestedName": requested_name,
                "customerId": ctx.customer_id,
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    else:
        res = {"requestId": None}

    # Round 4 §C-NEW-3 — chips: enquanto espera, pode ver cardápio ou cancelar.
    return ToolResult(
        message=(
            f"Avisei a galera da mesa {target_table} que você chegou. "
            "Tô esperando a confirmação deles."
        ),
        chips=[
            {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
            {"id": "cancel_late_arrival", "label": "Cancelar", "action": "send", "payload": "cancela o pedido de junção"},
        ],
        action_payload={"lateArrivalRequest": res},
    )
