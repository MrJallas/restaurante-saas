"""
Suggest dishes from the menu. Returns chips for fast tap-to-add.

VIP tone: when session_flags.is_vip is true we bias toward warmer copy.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    category = args.get("category")  # 'entrada' | 'principal' | 'sobremesa' | 'bebida'
    items = args.get("items") or []  # list of {id, name, priceCents}

    is_vip = bool(ctx.session_flags.get("is_vip"))

    if not items:
        prefix = (
            "Pra você, separei umas pedidas especiais:" if is_vip
            else "Olha o que tá saindo bem hoje:"
        )
        return ToolResult(message=f"{prefix} (peça mais detalhes que eu busco)")

    chips = [
        {
            "id": f"recommend-{i.get('id')}",
            "label": i.get("name", ""),
            "action": "send",
            "payload": f"quero o {i.get('name', '')}",
            "primary": False,
        }
        for i in items[:3]
    ]
    intro = (
        "Pensei nessas opções pra você:" if is_vip else "Tem essas opções legais:"
    )
    body = "\n".join(f"- {i.get('name')} — R$ {(i.get('priceCents', 0) / 100):.2f}" for i in items[:3])

    return ToolResult(
        message=f"{intro}\n{body}",
        chips=chips,
        action_payload={"category": category, "count": len(items)},
    )
