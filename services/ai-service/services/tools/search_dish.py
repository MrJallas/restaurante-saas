"""
Search dishes by free-text query.

Hits `apps/api`'s menu search endpoint; returns matching dishes as chips
the customer can tap to add. If `apps/api` is unreachable returns a stub
not_implemented payload so the LLM can fall back to text-only response.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    query = (args.get("query") or args.get("q") or "").strip()
    if not query:
        return ToolResult(error={
            "code": "missing_query",
            "message": "o que você quer buscar?",
        })

    items: list[dict] = []
    if ctx.api_client:
        try:
            res = ctx.api_client("GET", f"/menu/search?q={query}", None)
            items = (res or {}).get("items") if isinstance(res, dict) else (res or [])
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    if not items:
        # No matches OR no api_client wired — graceful fallback.
        # Round 4 §C-NEW-3 — chips guiam quando search não retornou nada.
        return ToolResult(
            message=f"Não achei nada com '{query}' no cardápio. Quer ver o cardápio inteiro?",
            chips=[
                {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
                {"id": "recommend", "label": "Me recomenda", "action": "send", "payload": "o que você recomenda?"},
                {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
            ],
            action_payload={"status": "not_implemented", "tool": "search_dish", "query": query},
        )

    chips = [
        {
            "id": f"search-{i.get('id')}",
            "label": i.get("name", ""),
            "action": "send",
            "payload": f"quero o {i.get('name', '')}",
            "primary": False,
        }
        for i in items[:5]
    ]
    body = "\n".join(
        f"- {i.get('name')} — R$ {(i.get('priceCents', 0) / 100):.2f}"
        for i in items[:5]
    )
    return ToolResult(
        message=f"Achei isso pra '{query}':\n{body}",
        chips=chips,
        action_payload={"query": query, "count": len(items)},
    )
