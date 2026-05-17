"""
Add an item to the customer's pending order (canonical name per F2 spec).

Renamed from `add_to_cart` — same semantics. The legacy `add_to_cart`
forwarding module was removed in P1 #30.

P1 #B-7 / Cat 12 hardening (round 3):
  - `quantity` validated as int 1-20 (qwen2.5-7b foi pego pedindo qty=3
    quando user disse "1 risoto"). Args fora do range são rejeitados com
    `bad_args` em vez de virar pedido errado.
  - `itemId` validado como UUID v4 (qwen2.5 às vezes manda o nome do prato
    em vez do UUID). Sem isso, o backend retornava 404 e o cliente não
    entendia.
  - chips canon retornados pro FE renderizar (ver chips_for_add abaixo).
"""

import re
from typing import Any
from .types import ToolContext, ToolResult


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _chips_for_add() -> list[dict[str, Any]]:
    """Chips canônicos pós-`add_to_order` (round 3 spec K-9 §B passo 3).

    Após adicionar, queremos que o cliente saiba os 3 next-steps típicos:
    ver pedido, pedir mais, fechar. Antes voltava `[]` sempre — o FE caía
    no trio estático do SUGGESTION_CHIPS, perdendo contexto.
    """
    return [
        {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
        {"id": "add_more", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
        {"id": "request_check", "label": "Pedir conta", "action": "send", "payload": "quero pagar a conta"},
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id") or args.get("menuItemId")
    raw_qty = args.get("quantity") or args.get("qty") or 1

    # Validation pass
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "itemId obrigatório"})
    if not isinstance(item_id, str) or not _UUID_RE.match(item_id.strip()):
        return ToolResult(error={
            "code": "bad_args",
            "message": "itemId precisa ser um UUID válido. Use o id do menu_item, não o nome.",
        })

    try:
        quantity = int(raw_qty)
    except (TypeError, ValueError):
        return ToolResult(error={
            "code": "bad_args",
            "message": "quantity precisa ser inteiro entre 1 e 20.",
        })
    if quantity < 1 or quantity > 20:
        return ToolResult(error={
            "code": "bad_args",
            "message": f"quantity fora do range (1-20). Recebido: {quantity}.",
        })

    payload = {"itemId": item_id, "quantity": quantity, "notes": args.get("notes")}

    return ToolResult(
        message=f"Adicionei {quantity}x ao seu pedido. Quer mais alguma coisa?",
        chips=_chips_for_add(),
        action_payload={"orderUpdated": True, "cartUpdated": True, **payload},
    )
