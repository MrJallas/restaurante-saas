"""
Show courtesy items the customer has on the table (compensations / brindes).

Per `complaint-flow-v12.md` the manager can send a courtesy compensation
after a complaint; this tool surfaces those items so the customer sees
them as part of the order without confusing them with paid items.

NOTE (P0 #6): there is no dedicated `/courtesy` endpoint on `apps/api`
yet. Courtesy items live as line items on the `complaints` flow (see
`apps/api/src/modules/complaints/complaints.controller.ts` line 73 —
`'courtesy'` is one of the resolution kinds). Until the dedicated
endpoint is wired, this tool is a SILENT navigation hint: it returns a
graceful message and an action_payload telling the FE to surface a
"chamar garçom" CTA instead of issuing a 404 backend call.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # Intentionally no api_client call here — endpoint doesn't exist yet.
    # Returning a friendly fallback keeps the LLM from looping on 404s.
    return ToolResult(
        message="Não consegui consultar suas cortesias agora. Quer que eu chame o garçom pra confirmar?",
        action_payload={
            "status": "not_implemented",
            "tool": "view_courtesy",
            # Hint to FE: render a single chip routing to call_waiter.
            "fallbackChip": "chamar garçom",
        },
    )
