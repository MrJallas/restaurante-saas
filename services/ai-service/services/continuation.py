"""
Continuation message pool — short welcome-back / wrap-up templates.

Per `packages/shared-types/src/ai.ts::ContinuationMessage`. Pool is keyed by
tenant + segment; segments capture customer state (returning/new, VIP/regular,
time-of-day). Falls back to a built-in default per `vip-customer.md` (warmer
tone for VIP).
"""

import random
from datetime import datetime, timezone
from typing import Optional

from .redis_pool import pool_get_all, pool_seed


# Defaults seeded on first miss. Each entry mirrors `ContinuationMessage`.
DEFAULTS: dict[str, list[dict]] = {
    # segment: returning · regular
    "returning:regular": [
        {
            "id": "r1",
            "kind": "idle_nudge",
            "template": "E aí, {customerName}! Que bom te ver de novo. Quer pedir o {favoriteItem} de novo?",
            "slots": ["customerName", "favoriteItem"],
            "weight": 1.0,
        },
        {
            "id": "r2",
            "kind": "idle_nudge",
            "template": "Olá, {customerName}! Posso te sugerir uma novidade hoje?",
            "slots": ["customerName"],
            "weight": 1.0,
        },
    ],
    # segment: returning · VIP — warmer tone per vip-customer.md
    "returning:vip": [
        {
            "id": "v1",
            "kind": "idle_nudge",
            "template": "Bem-vindo de volta, {customerName}! Já reservei a melhor energia da casa pra você.",
            "slots": ["customerName"],
            "weight": 1.0,
        },
        {
            "id": "v2",
            "kind": "idle_nudge",
            "template": "{customerName}, que prazer te ter aqui de novo. Posso já mandar seu {favoriteItem}?",
            "slots": ["customerName", "favoriteItem"],
            "weight": 1.0,
        },
    ],
    # segment: new customer
    "new:regular": [
        {
            "id": "n1",
            "kind": "idle_nudge",
            "template": "Bem-vindo! Posso te ajudar a escolher? Tem prato do dia legal hoje.",
            "slots": [],
            "weight": 1.0,
        },
    ],
    # segment: post-rating positive
    "pos_rating_positive": [
        {
            "id": "prp1",
            "kind": "pos_rating_positive",
            "template": "Que bom que curtiu, {customerName}! Volta sempre.",
            "slots": ["customerName"],
            "weight": 1.0,
        },
    ],
    # segment: post-rating neutral
    "pos_rating_neutral": [
        {
            "id": "prn1",
            "kind": "pos_rating_neutral",
            "template": "Valeu o feedback. Vamos melhorar.",
            "slots": [],
            "weight": 1.0,
        },
    ],
    # segment: post-complaint
    "pos_reclamacao": [
        {
            "id": "pc1",
            "kind": "pos_reclamacao",
            "template": "Recebido. A gerência já foi notificada — eles voltam pra você logo.",
            "slots": [],
            "weight": 1.0,
        },
    ],
    # segment: post-late-arrival approved
    "pos_join_approved": [
        {
            "id": "pja1",
            "kind": "pos_join_approved",
            "template": "Tá liberado! Senta na mesa {tableLabel} e aproveita.",
            "slots": ["tableLabel"],
            "weight": 1.0,
        },
    ],
    # segment: post-merge approved
    "pos_merge_approved": [
        {
            "id": "pma1",
            "kind": "pos_merge_approved",
            "template": "Mesas juntadas. Bom papo!",
            "slots": [],
            "weight": 1.0,
        },
    ],
}


def _key(tenant_id: str, segment: str) -> str:
    return f"continuation:{tenant_id}:{segment}"


def _segment_for_kind(kind: str) -> str:
    """Map a ContinuationMessageKind onto a default-pool segment."""
    if kind in DEFAULTS:
        return kind
    return "returning:regular"


def get_continuation(
    tenant_id: str,
    customer_ctx: Optional[dict] = None,
    kind: Optional[str] = None,
) -> Optional[dict]:
    """
    Pick a continuation message for the given customer context.

    customer_ctx (all optional):
      - is_returning: bool
      - is_vip: bool
      - customer_name: str
      - favorite_item: str
    kind: explicit ContinuationMessageKind to force (skips segment lookup).

    Returns a dict matching `ContinuationMessage`, or None when there's
    nothing in the pool for the chosen segment. Caller fills the template
    slots — we hand back the raw template + slot list.
    """
    customer_ctx = customer_ctx or {}

    if kind:
        segment = _segment_for_kind(kind)
    else:
        if customer_ctx.get("is_returning"):
            segment = "returning:vip" if customer_ctx.get("is_vip") else "returning:regular"
        else:
            segment = "new:regular"

    pool = pool_get_all(_key(tenant_id, segment))
    if not pool:
        defaults = DEFAULTS.get(segment, [])
        if defaults:
            pool_seed(_key(tenant_id, segment), defaults, ttl_seconds=3600)
            pool = list(defaults)

    if not pool:
        return None

    # Weighted random pick within segment.
    weights = [float(e.get("weight", 1.0)) for e in pool]
    chosen = random.choices(pool, weights=weights, k=1)[0]
    return chosen


def render_continuation(message: dict, slots: dict[str, str]) -> str:
    """Fill `{slot}` placeholders. Missing slots fall back to empty string."""
    out = message.get("template", "")
    for s in message.get("slots", []):
        out = out.replace("{" + s + "}", slots.get(s, ""))
    return out
