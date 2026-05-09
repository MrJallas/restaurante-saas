"""
Open the menu screen.

Router-style tool — FE swaps to ScreenCustomerMenu. Optional `category`
narrows the initial view (entrada / principal / sobremesa / bebida).

TODO: full menu fetching is wired through `apps/api`; this tool is a
navigation hint only — the LLM doesn't need the menu payload to answer
since menu_summary is already in the system prompt.

Round 3 (K-9): retorna chips canônicos por categoria pra que o FE possa
mostrar atalhos visuais ("Risoto", "Bebidas", "Sobremesas") em vez do
trio estático SUGGESTION_CHIPS.
"""

from typing import Any
from .types import ToolContext, ToolResult


def _chips_for_menu() -> list[dict[str, Any]]:
    return [
        {"id": "menu-pratos", "label": "Pratos", "action": "send", "payload": "mostra os pratos principais"},
        {"id": "menu-bebidas", "label": "Bebidas", "action": "send", "payload": "mostra as bebidas"},
        {"id": "menu-sobremesas", "label": "Sobremesas", "action": "send", "payload": "mostra as sobremesas"},
        {"id": "menu-recomenda", "label": "Recomende você", "action": "send", "payload": "o que você recomenda hoje?"},
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    category = args.get("category")  # optional: 'entrada' | 'principal' | etc.
    return ToolResult(
        message="Abre o cardápio pra você dar uma olhada.",
        chips=_chips_for_menu(),
        router_target="ScreenCustomerMenu",
        action_payload={"category": category} if category else {},
    )
