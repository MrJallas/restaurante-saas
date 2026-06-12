"""
Smart suggestions — deterministic Redis-backed pool.

Per A2's `packages/shared-types/src/ai.ts::SmartSuggestionsRequest`. The pool
is seeded by an admin job (see `scripts/seed_smart_suggestions.py`); on first
miss in production we fall back to a small built-in default so the FE never
gets an empty list.

Key shape: `smart-sug:<tenantId>:<surface>` — list of JSON-encoded SmartSuggestion.

────────────────────────────────────────────────────────────────────────────
Glossary · `surface` vs `situacao`
────────────────────────────────────────────────────────────────────────────
The smart-suggestions module exposes two related concepts that have ended
up overloaded in spec and code; F2 round documents the distinction so we
don't break clients while we bring naming together:

    surface   = WHERE the chips render (UI placement)
                ─ values: 'home' | 'post-rating' | 'idle' | 'continuation'
                ─ owned by the FE at call time (same tenant can hit the
                  same pool from different surfaces)

    situacao  = WHY the chips were triggered (trigger context)
                ─ examples per spec: 'pedido_atrasado' (order is late),
                  'chamado_sem_resposta' (waiter call unanswered),
                  'continuation' (post-rating wrap-up)
                ─ owned by the backend / orchestrator that decides which
                  surface to push these chips into

Both fields can be set independently — `surface` is required (matches the
shared-types contract) and `situacao` is optional (alias / extra metadata
the FE can use for analytics or copy variation). NO BREAKING CHANGE:
existing callers that only send `surface` keep working unchanged.
"""

import hashlib
import json
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from .redis_pool import pool_get_all, pool_seed


# Default seed — used if the Redis pool for a (tenant, surface) is empty.
# Mirrors the FE's `SmartSuggestion` shape: { id, label, text, category? }
DEFAULT_POOL: dict[str, list[dict]] = {
    "home": [
        {"id": "h1", "label": "O que tá bom hoje?", "text": "o que está saindo bem hoje?", "category": "explore"},
        {"id": "h2", "label": "Sugestão da casa", "text": "qual o prato do dia?", "category": "explore"},
        {"id": "h3", "label": "Algo leve", "text": "algo mais leve, por favor", "category": "explore"},
        {"id": "h4", "label": "Tô com fome", "text": "estou com muita fome, o que recomenda?", "category": "explore"},
        {"id": "h5", "label": "Pra duas pessoas", "text": "sugestões pra duas pessoas dividirem", "category": "explore"},
    ],
    "post-rating": [
        {"id": "pr1", "label": "Pedir conta", "text": "pode trazer a conta", "category": "wrap"},
        {"id": "pr2", "label": "Pedir mais um", "text": "queria pedir mais um", "category": "upsell"},
        {"id": "pr3", "label": "Sobremesa?", "text": "tem sobremesa boa?", "category": "upsell"},
    ],
    "idle": [
        {"id": "id1", "label": "Chamar garçom", "text": "chama o garçom", "category": "service"},
        {"id": "id2", "label": "Pedir conta", "text": "pode trazer a conta", "category": "wrap"},
        {"id": "id3", "label": "Cardápio", "text": "queria ver o cardápio", "category": "explore"},
    ],
    "continuation": [
        {"id": "c1", "label": "Continuar pedido", "text": "voltar onde parei no pedido", "category": "resume"},
        {"id": "c2", "label": "Ver pedidos passados", "text": "quais foram meus pedidos antigos?", "category": "history"},
    ],
}


# Mesmo esquema do continuation.py (decisão Caleb 2026-06-12): fingerprint
# do DEFAULT_POOL na chave — mudou o código, re-seed imediato sem TTL/flush.
_DEFAULTS_FINGERPRINT = hashlib.sha1(
    json.dumps(DEFAULT_POOL, sort_keys=True, ensure_ascii=False).encode("utf-8")
).hexdigest()[:10]


def _key(tenant_id: str, surface: str) -> str:
    return f"smart-sug:{tenant_id}:{surface}:{_DEFAULTS_FINGERPRINT}"


def get_suggestions(
    tenant_id: str,
    surface: str,
    limit: int = 3,
    customer_id: Optional[str] = None,
    session_id: Optional[str] = None,
    situacao: Optional[str] = None,
) -> dict:
    """
    Returns SmartSuggestionsResponse-shaped dict.

    `surface` is the UI placement (required); `situacao` is an optional
    trigger-context alias the orchestrator can pass through (e.g.
    'pedido_atrasado', 'chamado_sem_resposta'). When set, `situacao` is
    echoed back on the response payload so FE can use it for analytics
    or copy variation. Pool lookup keys off `surface` only — situacao
    doesn't change which pool we query.
    """
    if surface not in {"home", "post-rating", "idle", "continuation"}:
        surface = "home"

    pool = pool_get_all(_key(tenant_id, surface))
    if not pool:
        # Cache miss → seed default pool for this tenant + surface.
        defaults = DEFAULT_POOL.get(surface, [])
        if defaults:
            pool_seed(_key(tenant_id, surface), defaults, ttl_seconds=3600)
            pool = list(defaults)

    if not pool:
        out: dict = {
            "suggestions": [],
            "poolExpiresAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        }
        if situacao:
            out["situacao"] = situacao
        return out

    # Deterministic-ish: use customer_id+session_id+surface as RNG seed so
    # the same customer doesn't see the SAME chips on every reload, but
    # results are stable per request — handy for analytics.
    seed_str = f"{tenant_id}:{customer_id or ''}:{session_id or ''}:{surface}"
    rng = random.Random(hash(seed_str))
    sample = rng.sample(pool, min(limit, len(pool)))

    out = {
        "suggestions": sample,
        "poolExpiresAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }
    if situacao:
        out["situacao"] = situacao
    return out
