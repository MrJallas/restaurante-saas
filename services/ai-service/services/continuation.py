"""
Continuation message pool — short welcome-back / wrap-up templates.

Per `packages/shared-types/src/ai.ts::ContinuationMessage`. Pool is keyed by
tenant + segment; segments capture customer state (returning/new, VIP/regular,
time-of-day). Falls back to a built-in default per `vip-customer.md` (warmer
tone for VIP).
"""

import random
from copy import deepcopy
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
    # segment: post-complaint (Round 19 C2: RICH templates default + chips canon V20)
    "pos_reclamacao": [
        {
            "id": "pc1",
            "kind": "pos_reclamacao",
            "subtitle": "SUA RECLAMAÇÃO ESTÁ COM A GERENTE",
            "template": "Sua reclamação está com a {managerName}. Em média ela responde em ~{avgResponseMin} min.",
            "slots": ["managerName", "avgResponseMin"],
            "requires_slots": ["managerName", "avgResponseMin"],
            "chips": [
                {"id": "ver-chat", "label": "Ver chat", "action": "navigate", "payload": "complaint-thread"},
                {"id": "pedir-mais-tarde", "label": "Pedir mais tarde", "action": "send", "payload": "voltar mais tarde"},
                {"id": "falar-de-novo", "label": "Falar de novo", "action": "send", "payload": "quero falar sobre outro problema"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pc2",
            "kind": "pos_reclamacao",
            "subtitle": "SUA RECLAMAÇÃO ESTÁ COM A GERENTE",
            "template": "{managerName} já viu e está cuidando agora. Resposta em ~{avgResponseMin} min.",
            "slots": ["managerName", "avgResponseMin"],
            "requires_slots": ["managerName", "avgResponseMin"],
            "chips": [
                {"id": "ver-chat", "label": "Ver chat", "action": "navigate", "payload": "complaint-thread"},
                {"id": "pedir-mais-tarde", "label": "Pedir mais tarde", "action": "send", "payload": "voltar mais tarde"},
                {"id": "falar-de-novo", "label": "Falar de novo", "action": "send", "payload": "quero falar sobre outro problema"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pc3",
            "kind": "pos_reclamacao",
            "subtitle": "RECLAMAÇÃO ENCAMINHADA",
            "template": "Encaminhei pra {managerName}. Ela costuma voltar em ~{avgResponseMin} min com uma solução.",
            "slots": ["managerName", "avgResponseMin"],
            "requires_slots": ["managerName", "avgResponseMin"],
            "chips": [
                {"id": "ver-chat", "label": "Ver chat", "action": "navigate", "payload": "complaint-thread"},
                {"id": "pedir-mais-tarde", "label": "Pedir mais tarde", "action": "send", "payload": "voltar mais tarde"},
                {"id": "falar-de-novo", "label": "Falar de novo", "action": "send", "payload": "quero falar sobre outro problema"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pc_fallback",
            "kind": "pos_reclamacao",
            "subtitle": "RECLAMAÇÃO RECEBIDA",
            "template": "Recebido. Um gerente entra em contato com você por aqui em breve.",
            "slots": [],
            "chips": [
                {"id": "pedir-mais-tarde", "label": "Pedir mais tarde", "action": "send", "payload": "voltar mais tarde"},
                {"id": "falar-de-novo", "label": "Falar de novo", "action": "send", "payload": "quero falar sobre outro problema"},
            ],
            "weight": 0.5,
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
    # Round 19 (C3 + variations): 4 variants pra contextualidade rica.
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
        {
            "id": "vm2",
            "kind": "viu_menu",
            "subtitle": "VOCÊ ESTEVE NO MENU",
            "template": "Algum prato te chamou atenção, {customerName}? Posso ajudar a escolher um pareamento.",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "sobremesa-do-dia", "label": "Sobremesa do dia", "action": "send", "payload": "qual a sobremesa do dia?"},
                {"id": "vinho-da-casa", "label": "Vinho da casa", "action": "send", "payload": "qual o vinho da casa?"},
                {"id": "voltar-pro-menu", "label": "Voltar pro menu", "action": "navigate", "payload": "cardapio"},
                {"id": "indicacao", "label": "Me indica algo", "action": "send", "payload": "indica algo bom pra hoje"},
            ],
            "weight": 1.0,
        },
        {
            "id": "vm3",
            "kind": "viu_menu",
            "subtitle": "VOCÊ ESTEVE NO MENU",
            "template": "Vi que deu uma olhada no menu. Quer dicas do que tá saindo mais hoje?",
            "slots": [],
            "chips": [
                {"id": "mais-pedidos", "label": "Mais pedidos", "action": "send", "payload": "quais os mais pedidos hoje?"},
                {"id": "novidades", "label": "Novidades", "action": "send", "payload": "tem novidade no menu?"},
                {"id": "voltar-pro-menu", "label": "Voltar pro menu", "action": "navigate", "payload": "cardapio"},
                {"id": "comparar-pratos", "label": "Comparar dois", "action": "send", "payload": "compara dois pratos pra mim"},
            ],
            "weight": 1.0,
        },
        {
            "id": "vm4",
            "kind": "viu_menu",
            "subtitle": "VOCÊ ESTEVE NO MENU",
            "template": "E aí, achou algo bom? Posso comparar dois pratos ou sugerir uma combinação.",
            "slots": [],
            "chips": [
                {"id": "comparar-pratos", "label": "Comparar dois", "action": "send", "payload": "compara dois pratos pra mim"},
                {"id": "combinacao", "label": "Combinação", "action": "send", "payload": "sugere uma combinação"},
                {"id": "voltar-pro-menu", "label": "Voltar pro menu", "action": "navigate", "payload": "cardapio"},
                {"id": "sobremesa-do-dia", "label": "Sobremesa", "action": "send", "payload": "qual a sobremesa do dia?"},
            ],
            "weight": 0.8,
        },
    ],
    # Round 19 (variations): 4 variants — alterna entre formal e casual.
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
        {
            "id": "cg2",
            "kind": "chamou_garcom",
            "subtitle": "GARÇOM A CAMINHO",
            "template": "A caminho da sua mesa, {customerName}. Posso adiantar algo enquanto isso?",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "ver-bebidas", "label": "Ver bebidas", "action": "send", "payload": "mostra as bebidas"},
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "cancelar-chamado", "label": "Cancelar", "action": "send", "payload": "cancela o chamado do garçom"},
                {"id": "eta-garcom", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo o garçom leva?"},
            ],
            "weight": 1.0,
        },
        {
            "id": "cg3",
            "kind": "chamou_garcom",
            "subtitle": "GARÇOM AVISADO",
            "template": "Garçom notificado. Enquanto rola, quer ver bebidas ou sobremesas?",
            "slots": [],
            "chips": [
                {"id": "ver-bebidas", "label": "Ver bebidas", "action": "send", "payload": "mostra as bebidas"},
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "cancelar-chamado", "label": "Cancelar", "action": "send", "payload": "cancela o chamado do garçom"},
                {"id": "eta-garcom", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo o garçom leva?"},
            ],
            "weight": 1.0,
        },
        {
            "id": "cg4",
            "kind": "chamou_garcom",
            "subtitle": "CHAMADO DISPARADO",
            "template": "Pronto, chamado disparado. Tempo médio agora ~{waitMinutes} min.",
            "slots": ["waitMinutes"],
            "requires_slots": ["waitMinutes"],
            "chips": [
                {"id": "ver-bebidas", "label": "Ver bebidas", "action": "send", "payload": "mostra as bebidas"},
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "cancelar-chamado", "label": "Cancelar", "action": "send", "payload": "cancela o chamado do garçom"},
                {"id": "eta-garcom", "label": "Tempo médio?", "action": "send", "payload": "quanto tempo o garçom leva?"},
            ],
            "weight": 0.8,
        },
    ],
    # Round 19 (variations): 4 variants pra abriu_pedido.
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
        {
            "id": "ap2",
            "kind": "abriu_pedido",
            "subtitle": "PEDIDO EM ANDAMENTO",
            "template": "Entrou no fogão, {customerName}! Aviso assim que estiver pronto. Posso anotar mais alguma coisa?",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "adicionar-bebida", "label": "Adicionar bebida", "action": "send", "payload": "quero adicionar uma bebida"},
                {"id": "ver-pedido", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
                {"id": "pedir-mais", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "eta-cozinha", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo demora o pedido?"},
            ],
            "primary_cta": {"label": "Acompanhar pedido", "action": "navigate", "payload": "pedido"},
            "weight": 1.0,
        },
        {
            "id": "ap3",
            "kind": "abriu_pedido",
            "subtitle": "PEDIDO EM ANDAMENTO",
            "template": "Pedido em rota pra cozinha. Que tal já decidir a sobremesa enquanto espera?",
            "slots": [],
            "chips": [
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "adicionar-bebida", "label": "Adicionar bebida", "action": "send", "payload": "quero adicionar uma bebida"},
                {"id": "ver-pedido", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
                {"id": "eta-cozinha", "label": "Quanto tempo?", "action": "send", "payload": "quanto tempo demora o pedido?"},
            ],
            "primary_cta": {"label": "Acompanhar pedido", "action": "navigate", "payload": "pedido"},
            "weight": 1.0,
        },
        {
            "id": "ap4",
            "kind": "abriu_pedido",
            "subtitle": "PEDIDO EM ANDAMENTO",
            "template": "Tá lá, {customerName}. Tempo médio agora é ~{waitMinutes} min. Algo pra adoçar a espera?",
            "slots": ["customerName", "waitMinutes"],
            "requires_slots": ["customerName", "waitMinutes"],
            "chips": [
                {"id": "ver-sobremesas", "label": "Ver sobremesas", "action": "send", "payload": "mostra as sobremesas"},
                {"id": "adicionar-bebida", "label": "Adicionar bebida", "action": "send", "payload": "quero adicionar uma bebida"},
                {"id": "ver-pedido", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
                {"id": "pedir-mais", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
            ],
            "primary_cta": {"label": "Acompanhar pedido", "action": "navigate", "payload": "pedido"},
            "weight": 0.8,
        },
    ],
    # Round 19 (variations + no "Paguinho"): 4 variants pra pagamento.
    # "Paguinho" trocado por wording mais profissional.
    "pagou": [
        {
            "id": "pg1",
            "kind": "pagou",
            "subtitle": "PAGAMENTO OK",
            "template": "Pagamento confirmado, {customerName}! Mais alguma coisa antes de fechar a comanda?",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "conta-final", "label": "Pedir conta final", "action": "send", "payload": "quero a conta final"},
                {"id": "cafe", "label": "Café espresso", "action": "send", "payload": "quero um café espresso"},
                {"id": "ainda-quero", "label": "Ainda quero algo", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "avaliar", "label": "Avaliar atendimento", "action": "navigate", "payload": "avaliar"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pg2",
            "kind": "pagou",
            "subtitle": "PAGAMENTO OK",
            "template": "Tudo certo com o pagamento. Algo a mais ou já encaminho a finalização?",
            "slots": [],
            "chips": [
                {"id": "conta-final", "label": "Finalizar agora", "action": "send", "payload": "quero finalizar"},
                {"id": "cafe", "label": "Café espresso", "action": "send", "payload": "quero um café espresso"},
                {"id": "ainda-quero", "label": "Pedir mais algo", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "avaliar", "label": "Avaliar atendimento", "action": "navigate", "payload": "avaliar"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pg3",
            "kind": "pagou",
            "subtitle": "PAGAMENTO CONFIRMADO",
            "template": "Recebido, {customerName}. Quer um cafezinho antes de ir ou já é isso?",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "cafe", "label": "Sim, café", "action": "send", "payload": "quero um café"},
                {"id": "conta-final", "label": "Já é isso", "action": "send", "payload": "quero finalizar"},
                {"id": "ainda-quero", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
                {"id": "avaliar", "label": "Avaliar", "action": "navigate", "payload": "avaliar"},
            ],
            "weight": 1.0,
        },
        {
            "id": "pg4",
            "kind": "pagou",
            "subtitle": "PAGAMENTO PROCESSADO",
            "template": "Pagamento processado. Quer avaliar o atendimento antes de fechar?",
            "slots": [],
            "chips": [
                {"id": "avaliar", "label": "Avaliar agora", "action": "navigate", "payload": "avaliar"},
                {"id": "conta-final", "label": "Já vou", "action": "send", "payload": "quero finalizar"},
                {"id": "cafe", "label": "Café antes", "action": "send", "payload": "quero um café"},
                {"id": "ainda-quero", "label": "Pedir mais", "action": "send", "payload": "quero pedir mais alguma coisa"},
            ],
            "weight": 0.8,
        },
    ],
    # Round 19 (variations): 4 variants pra voltou_sem_acao.
    "voltou_sem_acao": [
        {
            "id": "vs1",
            "kind": "voltou_sem_acao",
            "subtitle": "DE VOLTA",
            "template": "Bem-vindo de volta. Da última vez foi {last_item}. Posso sugerir algo parecido ou mostrar novidades?",
            "slots": ["last_item"],
            "requires_slots": ["last_item"],
            "chips": [
                {"id": "repetir-ultima", "label": "Repetir última", "action": "send", "payload": "quero pedir igual da última vez"},
                {"id": "novidades", "label": "Mostrar novidades", "action": "send", "payload": "o que tem de novo no cardápio?"},
                {"id": "algo-leve", "label": "Algo leve", "action": "send", "payload": "me indica algo leve"},
                {"id": "comecar-zero", "label": "Começar do zero", "action": "send", "payload": "abre o cardápio"},
            ],
            "weight": 1.0,
        },
        {
            "id": "vs2",
            "kind": "voltou_sem_acao",
            "subtitle": "DE VOLTA",
            "template": "Oi {customerName}! Tem novidade no menu. Quer ver ou repete o {last_item} da última vez?",
            "slots": ["customerName", "last_item"],
            "requires_slots": ["customerName", "last_item"],
            "chips": [
                {"id": "novidades", "label": "Ver novidades", "action": "send", "payload": "o que tem de novo no cardápio?"},
                {"id": "repetir-ultima", "label": "Repetir última", "action": "send", "payload": "quero pedir igual da última vez"},
                {"id": "algo-leve", "label": "Algo leve", "action": "send", "payload": "me indica algo leve"},
                {"id": "comecar-zero", "label": "Cardápio", "action": "send", "payload": "abre o cardápio"},
            ],
            "weight": 1.0,
        },
        {
            "id": "vs3",
            "kind": "voltou_sem_acao",
            "subtitle": "DE VOLTA",
            "template": "Voltou! Que tal experimentar algo novo hoje? Posso indicar uma combinação.",
            "slots": [],
            "chips": [
                {"id": "novidades", "label": "Novidades", "action": "send", "payload": "o que tem de novo no cardápio?"},
                {"id": "indicacao", "label": "Me indica", "action": "send", "payload": "indica algo bom pra hoje"},
                {"id": "algo-leve", "label": "Algo leve", "action": "send", "payload": "me indica algo leve"},
                {"id": "comecar-zero", "label": "Cardápio", "action": "send", "payload": "abre o cardápio"},
            ],
            "weight": 1.0,
        },
        {
            "id": "vs4",
            "kind": "voltou_sem_acao",
            "subtitle": "DE VOLTA",
            "template": "Bem-vindo de volta, {customerName}. Quer começar pelo cardápio ou prefere uma indicação?",
            "slots": ["customerName"],
            "requires_slots": ["customerName"],
            "chips": [
                {"id": "comecar-zero", "label": "Ver cardápio", "action": "send", "payload": "abre o cardápio"},
                {"id": "indicacao", "label": "Me indica", "action": "send", "payload": "indica algo bom"},
                {"id": "novidades", "label": "Novidades", "action": "send", "payload": "o que tem de novo no cardápio?"},
                {"id": "algo-leve", "label": "Algo leve", "action": "send", "payload": "me indica algo leve"},
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
    slots: Optional[dict[str, str]] = None,
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
    slots = slots or {}

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

    # Explicit `voltou_sem_acao` is used by tests and a few callers that render
    # slots later. Keep the canonical last-item template available in that path;
    # `render_continuation` already has the neutral fallback when last_item is
    # actually missing.
    if kind == "voltou_sem_acao" and not slots:
        for entry in pool:
            if "last_item" in (entry.get("slots") or []):
                return entry

    # Round 19 (C1 fix) · filtra templates cujo `requires_slots` não está
    # totalmente populado em `slots`. Permite ter variants do mesmo kind:
    # uma "rica" exigindo customerName/managerName/etc, outra fallback sem
    # slots. Antes era 50/50 e a rica gerava "Paguinho registrado, ." com
    # vírgula órfã quando customerName=null.
    eligible_pool = []
    for entry in pool:
        required = entry.get("requires_slots") or []
        if all((slots.get(s) or "").strip() for s in required):
            eligible_pool.append(entry)
    if not eligible_pool:
        eligible_pool = pool  # fallback se nenhum eligible (shouldn't happen)

    # Weighted random pick within segment.
    weights = [float(e.get("weight", 1.0)) for e in eligible_pool]
    chosen = random.choices(eligible_pool, weights=weights, k=1)[0]
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


def _chips_with_context(chips: list[dict], slots: dict[str, str]) -> list[dict]:
    order_id = (slots.get("orderId") or slots.get("lastOrderId") or "").strip()
    if not order_id:
        return deepcopy(chips)

    out = deepcopy(chips)
    for chip in out:
        if (
            chip.get("id") == "avaliar"
            and chip.get("action") == "navigate"
            and chip.get("payload") in ("avaliar", "/avaliar")
        ):
            chip["payload"] = f"avaliar:{order_id}"
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
    msg = get_continuation(tenant_id=tenant_id, customer_ctx=customer_ctx, kind=kind, slots=slots)
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
        "chips": _chips_with_context(msg.get("chips", []), rendered_slots),
    }
    if "primary_cta" in msg:
        out["primary_cta"] = msg["primary_cta"]
    return out
