"""
Router tool: jumps the customer to the formal complaint composer.

Per `complaint-flow-v12.md`, complaint composition lives in
`ScreenCustomerComplaintCompose` — this tool is a navigation hint, not
an inline reply.
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
