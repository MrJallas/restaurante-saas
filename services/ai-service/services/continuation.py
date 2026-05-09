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
    # ─────────────────────────────────────────────────────────────
    # Round 3 (Cat 5) · 5 novos kinds pra cobrir o canvas v20:
    # viu_menu, chamou_garcom, abriu_pedido, pagou, voltou_sem_acao.
    # Cada um tem `chips` canon — FE renderiza via SuggestionChipRow.
    # ─────────────────────────────────────────────────────────────
    "viu_menu": [
        {
            "id": "vm1",
            "kind": "viu_menu",
            "subtitle": "VOCÊ ESTEVE NO MENU",
            "template": "Tava bisbilhotando o menu? Posso te recomendar uma sobremesa do dia ou um vinho que combina.",
            "slots": [],
            "chips": [
                {"id": "sobremesa-do-dia", "label": "Sobremesa do dia", "action": "send", "payload": "qual a sobremesa do dia?"},
                {"id": "vinho-da-casa", "label": "Vinho da casa", "action": "send", "payload": "qual o vinho da casa?"},
                {"id": "voltar-pro-menu", "label": "Voltar pro menu", "action": "navigate", "payload": "cardapio"},
                {"id": "comparar-pratos", "label": "Comparar dois pratos", "action": "send", "payload": "compara dois pratos pra mim"},
            ],
            "weight": 1.0,
        },
    ],
    "chamou_garcom": [
        {
            "id": "cg1",
            "kind": "chamou_garcom",
            "subtitle": "GARÇOM AVISADO",
            "template": "Avisei o garçom — ele tá indo aí. Quer ir vendo a próxima rodada enquanto isso?",
            "slots": [],
            "chips": [
                {"id": "ver-bebidas", "label": "Ver bebidas", "action": "send", "payload": "mostra as bebidas"},
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "cancelar-chamado", "label": "Cancelar chamado", "action": "send", "payload": "cancela o chamado do garçom"},
                {"id": "eta-garcom", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo o garçom leva?"},
            ],
            "weight": 1.0,
        },
    ],
    "abriu_pedido": [
        {
            "id": "ap1",
            "kind": "abriu_pedido",
            "subtitle": "PEDIDO EM ANDAMENTO",
            "template": "Seu pedido tá com a cozinha. Te aviso aqui quando estiver pronto pra ir. Quer adicionar algo enquanto espera?",
            "slots": [],
            "chips": [
                {"id": "adicionar-bebida", "label": "Adicionar bebida", "action": "send", "payload": "quero adicionar uma bebida"},
                {"id": "ver-pedido", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
                {"id": "pedir-mais", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "eta-cozinha", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo demora o pedido?"},
            ],
            "primary_cta": {"label": "Acompanhar pedido", "action": "navigate", "payload": "pedido"},
            "weight": 1.0,
        },
    ],
    "pagou": [
        {
            "id": "pg1",
            "kind": "pagou",
            "subtitle": "PAGAMENTO OK",
            "template": "Paguinho registrado, {customerName}. Mais alguma coisa antes de fechar a comanda?",
            "slots": ["customerName"],
            "chips": [
                {"id": "conta-final", "label": "Pedir conta final", "action": "send", "payload": "quero a conta final"},
                {"id": "cafe", "label": "Café espresso", "action": "send", "payload": "quero um café espresso"},
                {"id": "ainda-quero", "label": "Ainda quero algo", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "avaliar", "label": "Avaliar atendimento", "action": "navigate", "payload": "avaliar"},
            ],
            "weight": 1.0,
        },
    ],
    "voltou_sem_acao": [
        {
            "id": "vs1",
            "kind": "voltou_sem_acao",
            "subtitle": "DE VOLTA",
            "template": "Bem-vindo de volta. Da última vez foi {last_item}. Posso sugerir algo parecido ou mostrar novidades?",
            "slots": ["last_item"],
            "chips": [
                {"id": "repetir-ultima", "label": "Repetir última", "action": "send", "payload": "quero pedir igual da última vez"},
                {"id": "novidades", "label": "Mostrar novidades", "action": "send", "payload": "o que tem de novo no cardápio?"},
                {"id": "algo-leve", "label": "Algo leve", "action": "send", "payload": "me indica algo leve"},
                {"id": "comecar-zero", "label": "Começar do zero", "action": "send", "payload": "abre o cardápio"},
            ],
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
    """
    Fill `{slot}` placeholders.

    Round 4 (C-NEW-4): se a template é de um kind contextual e algum slot
    obrigatório está vazio, troca pra um fallback genérico em vez de
    deixar o `{slot}` literal vazar pro cliente. Antes, GET
    `/continuation?kind=voltou_sem_acao` sem `last_item` rendia
    "...da última vez foi . Posso..." — agora cai num copy neutro.
    """
    template = message.get("template", "")
    declared_slots = message.get("slots") or []

    missing = [s for s in declared_slots if not (slots.get(s) or "").strip()]

    # Caso especial · `voltou_sem_acao` sem last_item: a template gira em
    # torno do "Da última vez foi {last_item}", sem ele a frase pifa.
    if missing and message.get("kind") == "voltou_sem_acao" and "last_item" in missing:
        template = (
            "Bem-vindo de volta. Posso sugerir algo novo ou mostrar o "
            "cardápio do dia?"
        )

    out = template
    for s in declared_slots:
        out = out.replace("{" + s + "}", slots.get(s) or "")
    return out


def get_continuation_full(
    tenant_id: str,
    customer_ctx: dict | None = None,
    kind: str | None = None,
    slots: dict[str, str] | None = None,
) -> dict | None:
    """
    Convenience wrapper · retorna o ContinuationMessage canônico já com
    template renderizado + chips + subtitle preservados.

    Usado pelo apps/api `home.service.ts` (round 3 Cat 5) pra simplificar
    o pipeline GET /continuation: 1 chamada, payload completo.

    Returns dict com:
      - id, kind, template, subtitle, weight (do pool)
      - chips: list[ContextualChip] (canônicos do canvas v20)
      - rendered: string com slots resolvidos
      - primary_cta: optional dict (só presente em alguns kinds, ex.
        'abriu_pedido' que tem botão fixo "Acompanhar pedido")
    """
    msg = get_continuation(tenant_id=tenant_id, customer_ctx=customer_ctx, kind=kind)
    if not msg:
        return None

    rendered_slots = slots or {}
    rendered = render_continuation(msg, rendered_slots)
    out = {
        "id": msg.get("id"),
        "kind": msg.get("kind"),
        "subtitle": msg.get("subtitle"),
        "template": msg.get("template"),
        "rendered": rendered,
        "chips": msg.get("chips", []),
    }
    if "primary_cta" in msg:
        out["primary_cta"] = msg["primary_cta"]
    return out
