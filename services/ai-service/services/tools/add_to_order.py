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

Tarefa 2C (2026-08-31) — resolver NOME → UUID, mas só quando não há dúvida:
  O LLM continua emitindo `add_to_order(itemId="agua")`. Rejeitar de cara
  com `bad_args` custava o pedido inteiro: sem card, sem item, e o cliente
  recebia o fallback genérico "Não consegui consultar essa informação agora"
  (main.py, ramo `tool_result.error`). Agora o nome é resolvido contra o
  cardápio via `ctx.api_client` (mesmo endpoint que `search_dish` usa),
  com a política de produto decidida pelo dono:

    - match exato do nome normalizado (minúsculas, sem acento, plural
      simples) → usa;
    - um ÚNICO candidato plausível → usa;
    - 2+ candidatos → NÃO escolhe. Devolve a pergunta + chips com os
      candidatos pro cliente decidir;
    - nenhum candidato → erro (comportamento anterior preservado).

  O motivo do "nunca chute" é de produto: escolher o "mais pedido" lança o
  item ERRADO na conta de um cliente pagante. Ambiguidade é pergunta, não
  palpite.

  O caso ambíguo volta como `message` + `chips` + `action_payload`
  (`needsDisambiguation`), que é o contrato que as outras tools já usam pra
  "preciso perguntar" (ver `search_dish` sem resultado e `recommend_dish`
  sem itens). Devolver `error` aqui seria contraproducente: main.py troca
  todo resultado que só tem `error` pelo bubble genérico — exatamente o
  sintoma que esta tarefa fecha. O payload ambíguo NÃO carrega
  `orderUpdated`/`cartUpdated` nem `itemId`, então nada é lançado no pedido.

  A mutação continua sendo do backend, a partir do `action_payload` — esta
  tool não faz POST de carrinho (invariante do round 22, coberto por
  `tests/test_tool_paths.py::test_customer_draft_order_tools_do_not_call_api`).
"""

import re
import unicodedata
from typing import Any, Optional
from urllib.parse import quote

from .types import ToolContext, ToolResult


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# apps/api `menu.controller.ts` rejeita q < 2 chars (devolve items: []) e
# q > 50 chars (400). Fora da janela nem tentamos a busca remota.
_SEARCH_MIN_LEN = 2
_SEARCH_MAX_LEN = 50

# Máximo de candidatos oferecidos na pergunta de desambiguação.
_MAX_CANDIDATES = 5

# Artigos/preposições que o LLM cola no nome ("o risoto", "uma agua").
# Removidos só da QUERY — o nome do item no cardápio fica intacto.
_STOPWORDS = {
    "o", "a", "os", "as", "um", "uma", "uns", "umas",
    "de", "do", "da", "dos", "das",
    # Sem estas, `itemId="na"` casava a preposicao DENTRO de "Picanha na Brasa"
    # e lancava R$ 78,90 na conta: os nomes do cardapio nao passam pela remocao
    # de stopwords, entao a camada contigua encontrava o match.
    "no", "na", "nos", "nas", "em", "ao", "aos", "e", "com", "para", "pra", "por",
}

# Piso de especificidade para match NAO-exato. Uma query de 1-2 caracteres so
# resolve se for o nome inteiro do item; caso contrario ela casaria pedaco de
# qualquer nome do cardapio.
_MIN_FUZZY_LEN = 3


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


# ─────────────────────────────────────────────────────────────
# Normalização
# ─────────────────────────────────────────────────────────────


def _strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _tokens(value: Any) -> list[str]:
    """minúsculas + sem acento + pontuação vira separador → lista de tokens.

    "Água-de-Coco 500ml" → ["agua", "de", "coco", "500ml"]
    """
    text = _strip_accents(str(value or "")).lower()
    return [t for t in re.split(r"[^a-z0-9]+", text) if t]


def _singular(token: str) -> str:
    """Plural pt-BR barato: só o "s" final.

    Cobre "aguas"→"agua", "sucos"→"suco". NÃO mexe em "ões/ães/is" — a
    heurística agressiva erraria mais do que acerta e aqui errar significa
    lançar o item errado na conta.
    """
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _key(value: Any) -> str:
    """Chave de comparação: normalizada + singularizada, tokens por espaço."""
    return " ".join(_singular(t) for t in _tokens(value))


def _query_key(value: Any) -> str:
    """Chave da query, sem artigos/preposições nas bordas e no meio.

    Query só de stopword devolve "" (não cai nos tokens crus): sem isso, um
    `itemId="na"` casaria a preposição DENTRO de "Picanha na Brasa" — os nomes
    do cardápio não passam pela remoção de stopwords — e lançaria um item de
    R$ 78,90 na conta. Sem token significativo não há o que resolver.
    """
    toks = [_singular(t) for t in _tokens(value)]
    meaningful = [t for t in toks if t not in _STOPWORDS]
    return " ".join(meaningful)


# ─────────────────────────────────────────────────────────────
# Candidatos
# ─────────────────────────────────────────────────────────────


def _as_items(res: Any) -> list[dict[str, Any]]:
    """Aceita `{items: [...]}` ou a lista crua (mesmo shape do search_dish)."""
    raw = res.get("items") if isinstance(res, dict) else res
    return [i for i in (raw or []) if isinstance(i, dict)]


def _candidate(row: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Linha do cardápio → candidato {id, name, priceCents, key}.

    apps/api devolve SQL cru em snake_case (`price_cents`); aceitar só
    camelCase faria o card sair com R$ 0,00 (mesmo bug já corrigido em
    `compare_dishes`).
    """
    item_id = row.get("id")
    name = row.get("name")
    if not isinstance(item_id, str) or not _UUID_RE.match(item_id.strip()):
        return None
    if not isinstance(name, str) or not name.strip():
        return None
    raw_price = row.get("priceCents")
    if raw_price is None:
        raw_price = row.get("price_cents")
    price_cents = int(raw_price) if isinstance(raw_price, (int, float)) else None
    return {
        "id": item_id.strip(),
        "name": name.strip(),
        "priceCents": price_cents,
        "key": _key(name),
    }


def _narrow(query_key: str, pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Camada mais apertada que ainda tem candidato; [] se nenhuma tem.

    1. nome idêntico à query;
    2. query aparece como sequência de palavras inteiras no nome
       ("agua" casa "agua mineral", NÃO casa "guarana");
    3. todos os tokens da query aparecem no nome, em qualquer ordem
       ("risoto camarao" casa "risoto de camarao").
    """
    if not query_key:
        return []

    exact = [c for c in pool if c["key"] == query_key]
    if exact:
        return exact

    # Abaixo do piso, so o nome inteiro vale: "na"/"ao" casariam pedaco de
    # meio cardapio pelas camadas 2 e 3.
    if len(query_key) < _MIN_FUZZY_LEN:
        return []

    contiguous_re = re.compile(rf"(?:^| ){re.escape(query_key)}(?:$| )")
    contiguous = [c for c in pool if contiguous_re.search(c["key"])]
    if contiguous:
        return contiguous

    query_tokens = set(query_key.split())
    if not query_tokens:
        return []
    subset = [c for c in pool if query_tokens.issubset(set(c["key"].split()))]
    return subset


def _fetch_candidates(query: str, query_key: str, ctx: ToolContext) -> list[dict[str, Any]]:
    """Busca candidatos no cardápio. Levanta a exceção do api_client."""
    pool: list[dict[str, Any]] = []

    # 1) Endpoint de busca do cardápio — mesmo caminho do `search_dish`.
    if _SEARCH_MIN_LEN <= len(query) <= _SEARCH_MAX_LEN:
        res = ctx.api_client("GET", f"/menu/search?q={quote(query, safe='')}", None)
        pool = [c for c in (_candidate(r) for r in _as_items(res)) if c]

    if pool:
        # `/menu/search` casa por nome OU tags OU ingredients. Um hit unico que
        # veio por ingrediente NAO e "candidato obvio": "limao" devolveria so a
        # Caipirinha e "batata" so o Bolinho de Bacalhau, lancando na conta um
        # item cujo nome o cliente nunca disse. So o match por NOME vale.
        narrowed = _narrow(query_key, pool)
        if narrowed:
            return narrowed
        # Nenhum nome casou no pool da busca. Pode ser ruido de ingrediente/tag
        # ou o `ORDER BY total_orders DESC LIMIT 20` do endpoint ter cortado o
        # candidato certo. Antes de desistir, varre o cardapio inteiro por nome.

    # 2) Fallback local sobre o cardápio inteiro. O ILIKE do Postgres é
    #    case-insensitive mas NÃO accent-insensitive: `%agua%` não casa
    #    "Água Mineral". Aqui a comparação é sobre a chave normalizada, então
    #    acento e plural deixam de derrubar a resolução.
    res = ctx.api_client("GET", "/menu/items", None)
    all_items = [c for c in (_candidate(r) for r in _as_items(res)) if c]
    return _narrow(query_key, all_items)


def _ask_which_one(query: str, candidates: list[dict[str, Any]]) -> ToolResult:
    """2+ candidatos → pergunta, nunca palpite."""
    shortlist = candidates[:_MAX_CANDIDATES]
    names = [c["name"] for c in shortlist]
    listing = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} e {names[-1]}"
    return ToolResult(
        message=f"Temos {listing}. Qual você quer?",
        chips=[
            {
                "id": f"disambiguate-{c['id']}",
                "label": c["name"],
                "action": "send",
                "payload": f"quero o {c['name']}",
            }
            for c in shortlist
        ],
        action_payload={
            "needsDisambiguation": True,
            "query": query,
            "candidates": [{"id": c["id"], "name": c["name"]} for c in shortlist],
        },
    )


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id") or args.get("menuItemId")
    raw_qty = args.get("quantity") or args.get("qty") or 1

    # Validation pass
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "itemId obrigatório"})
    if not isinstance(item_id, str) or not item_id.strip():
        return ToolResult(error={
            "code": "bad_args",
            "message": "itemId precisa ser o id ou o nome do item do cardápio.",
        })

    # `quantity` é validado ANTES da resolução de nome: é checagem local e
    # barata, e evita gastar uma chamada HTTP num tool-call que já nasceu
    # inválido.
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

    raw_item = item_id.strip()
    resolved: Optional[dict[str, Any]] = None

    if not _UUID_RE.match(raw_item):
        # O LLM mandou o nome. Resolve — sem chutar.
        if not ctx.api_client:
            return ToolResult(error={
                "code": "bad_args",
                "message": "itemId precisa ser um UUID válido. Use o id do menu_item, não o nome.",
            })

        query_key = _query_key(raw_item)
        try:
            candidates = _fetch_candidates(raw_item, query_key, ctx)
        except Exception as e:  # noqa: BLE001 — tool nunca derruba o orquestrador
            return ToolResult(error={"code": "api_error", "message": str(e)})

        if not candidates:
            return ToolResult(error={
                "code": "item_not_found",
                "message": f"Não achei '{raw_item}' no cardápio.",
            })
        if len(candidates) > 1:
            return _ask_which_one(raw_item, candidates)
        resolved = candidates[0]

    payload: dict[str, Any] = {
        "itemId": resolved["id"] if resolved else raw_item,
        "quantity": quantity,
        "notes": args.get("notes"),
    }
    if resolved:
        # Nome/preço vêm do cardápio e poupam um round-trip do FE
        # (`resolveToolMenuItem`). O backend sobrescreve com os valores
        # autoritativos em `enrichToolActionPayload`, e o preço final do
        # pedido é sempre recalculado no banco em `orders.service.ts`.
        payload["name"] = resolved["name"]
        if resolved["priceCents"] is not None:
            payload["priceCents"] = resolved["priceCents"]

    what = f"{resolved['name']} " if resolved else ""
    return ToolResult(
        message=f"Adicionei {quantity}x {what}ao seu pedido. Quer mais alguma coisa?",
        chips=_chips_for_add(),
        action_payload={"orderUpdated": True, "cartUpdated": True, **payload},
    )
