"""
Open the formal complaint composer (canonical name per F2 spec).

Renamed from `complaint_compose` — same semantics. Per `complaint-flow-v12.md`,
complaint composition lives in `ScreenCustomerComplaintCompose`; this is a
routing tool that takes the customer to that screen. The legacy
`complaint_compose` forwarding module was removed in P1 #30.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Vou te levar pra tela de reclamação onde você pode descrever direitinho o que rolou.",
        router_target="ScreenCustomerComplaintCompose",
        action_payload={
            "prefillReason": args.get("reason"),
            "complaintType": args.get("type"),
        },
    )
