"""
Open the menu screen.

Router-style tool — FE swaps to ScreenCustomerMenu. Optional `category`
narrows the initial view (entrada / principal / sobremesa / bebida).

TODO: full menu fetching is wired through `apps/api`; this tool is a
navigation hint only — the LLM doesn't need the menu payload to answer
since menu_summary is already in the system prompt.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    category = args.get("category")  # optional: 'entrada' | 'principal' | etc.
    return ToolResult(
        message="Abre o cardápio pra você dar uma olhada.",
        router_target="ScreenCustomerMenu",
        action_payload={"category": category} if category else {},
    )
