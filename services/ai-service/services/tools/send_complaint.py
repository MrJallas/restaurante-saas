"""
Open the formal complaint composer (canonical name per F2 spec).

Renamed from `complaint_compose` — same semantics. Per `avaliacao-e-reclamacao.md`,
complaint composition lives in `ScreenCustomerComplaintCompose`; this is a
routing tool that takes the customer to that screen. The legacy
`complaint_compose` forwarding module was removed in P1 #30.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Vou abrir a tela de reclamação formal para você descrever o problema.",
        # action='expand' pede ao FE pra abrir o ContextualInputExpand
        # com o textarea grande de 240 chars (canvas v14). Spec K-7.
        chips=[
            {
                "id": "complaint-text",
                "label": "Registrar reclamação formal",
                "action": "expand",
                "payload": "Descreva o problema para registrar a reclamação...",
            },
            {"id": "cancel", "label": "Cancelar", "action": "send", "payload": "deixa pra lá"},
        ],
        router_target="ScreenCustomerComplaintCompose",
        action_payload={
            "prefillReason": args.get("reason"),
            "complaintType": args.get("type"),
        },
    )
