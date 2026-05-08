"""
Show the customer's current pending order (cart contents · pre-confirm).

Router-style tool — FE swaps to ScreenCustomerOrderReview. The LLM
typically calls this when the customer says "vê meu pedido", "o que tá no
carrinho", etc.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    items: list[dict] = []
    total_cents = 0
    if ctx.api_client:
        try:
            res = ctx.api_client("GET", "/customer/cart", None) or {}
            items = res.get("items") or []
            total_cents = res.get("totalCents") or 0
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    if not items:
        return ToolResult(
            message="Seu pedido tá vazio. Quer dar uma olhada no cardápio?",
            action_payload={"orderEmpty": True},
        )

    lines = []
    for it in items:
        qty = it.get("quantity") or 1
        name = it.get("name") or it.get("itemId") or "?"
        price = (it.get("priceCents") or 0) / 100
        lines.append(f"- {qty}x {name} — R$ {price:.2f}")

    return ToolResult(
        message=f"Seu pedido até agora:\n" + "\n".join(lines) + f"\nTotal: R$ {total_cents/100:.2f}",
        router_target="ScreenCustomerOrderReview",
        action_payload={"items": items, "totalCents": total_cents},
    )
