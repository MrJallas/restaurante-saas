"""Show courtesy items the customer has on the table."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # The new endpoint is session-protected by cookie/header, so the Python
    # tool must not call it server-side without the customer's browser session.
    # The FE receives this payload and fetches GET /customer/courtesies itself.
    return ToolResult(
        message="Vou mostrar as cortesias disponíveis para esta mesa.",
        chips=[
            {"id": "courtesy-view", "label": "Ver cortesias", "action": "send", "payload": "ver minhas cortesias"},
            {"id": "courtesy-view-order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
        ],
        action_payload={
            "action": "show_courtesies",
            "tool": "view_courtesy",
        },
    )
