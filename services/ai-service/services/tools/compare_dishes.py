"""
Compare 2+ dishes side by side (price, allergens, prep style).

Accepts `itemIds: string[]` (length >= 2). Returns a concise comparison the
LLM can render as a table-like bubble.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_ids = args.get("itemIds") or args.get("item_ids") or []
    if not isinstance(item_ids, list) or len(item_ids) < 2:
        return ToolResult(error={
            "code": "need_two_items",
            "message": "preciso de pelo menos 2 pratos pra comparar",
        })

    if not ctx.api_client:
        return ToolResult(
            message="Não consegui carregar os detalhes pra comparar agora.",
            action_payload={"status": "not_implemented", "tool": "compare_dishes", "itemIds": item_ids},
        )

    items: list[dict] = []
    for iid in item_ids:
        try:
            details = ctx.api_client("GET", f"/menu/items/{iid}", None) or {}
            items.append(details)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    normalized_items = []
    lines = []
    for it in items:
        # apps/api devolve linhas SQL em snake_case. Aceitar só priceCents
        # fazia todo compare real exibir R$ 0,00 apesar de o banco ter o preço.
        raw_price = it.get("priceCents")
        if raw_price is None:
            raw_price = it.get("price_cents")
        price_cents = int(raw_price) if isinstance(raw_price, (int, float)) else 0
        price = price_cents / 100
        allergens = it.get("allergens") or []
        allergens_str = f" · alérgenos: {', '.join(allergens)}" if allergens else ""
        lines.append(f"- {it.get('name', '?')}: R$ {price:.2f}".replace(".", ",") + allergens_str)
        normalized_items.append({
            **it,
            "priceCents": price_cents,
            "imageUrl": it.get("imageUrl") if it.get("imageUrl") is not None else it.get("image_url"),
            "categoryName": it.get("categoryName") if it.get("categoryName") is not None else it.get("category_name"),
        })

    # Round 4 §C-NEW-3 — chips por item facilitam "quero esse" 1-tap
    chips = [
        {
            "id": f"compare-pick-{it.get('id')}",
            "label": f"Quero {it.get('name', 'esse')}",
            "action": "send",
            "payload": f"quero o {it.get('name', '')}",
        }
        for it in items[:2]
    ]
    chips.append({
        "id": "compare-other",
        "label": "Comparar outros",
        "action": "send",
        "payload": "compara outros pratos pra mim",
    })

    return ToolResult(
        message="Comparando:\n" + "\n".join(lines),
        chips=chips,
        action_payload={"items": normalized_items},
    )
