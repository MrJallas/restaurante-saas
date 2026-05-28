"""
Request table merge — "junta minha mesa com a mesa N" (canonical name per F2).

Renamed from `table_merge_request`; the legacy forwarding module was removed
in P1 #30. Per `customer-host-model.md` lines 178+. The actual request
creation is protected by the customer's browser session, so this tool returns
the payload that makes the frontend open the salon map or create the request
with the known target.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    target_table = args.get("targetTable") or args.get("target_table")
    if not target_table:
        return ToolResult(
            message="Abri o mapa do salão para você escolher a mesa.",
            chips=[
                {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
                {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
            ],
            action_payload={"requiresTargetSelection": True},
        )

    return ToolResult(
        message=(
            f"Vou pedir para juntar com a mesa {target_table}. "
            "Se essa mesa estiver ocupada, os hosts das duas mesas confirmam no app."
        ),
        chips=[
            {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
            {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
            {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
        ],
        action_payload={"targetTableLabel": str(target_table)},
    )
