"""
Tarefa 2C — `add_to_order` resolve NOME → UUID, mas só quando não há dúvida.

O LLM emite `add_to_order(itemId="agua")` com frequência. Antes isso morria
em `bad_args` e o cliente recebia o bubble genérico "Não consegui consultar
essa informação agora" (main.py troca todo resultado só-com-`error` por ele).

A política de produto (decisão do dono, opção C) é:

  match exato        → usa
  candidato único    → usa
  2+ candidatos      → PERGUNTA (nunca chuta: item errado na conta de um
                       cliente pagante é pior do que uma pergunta a mais)
  nenhum candidato   → erro

Estes testes travam a política inteira, incluindo o invariante mais
importante: no caso ambíguo o `action_payload` NÃO pode carregar
`itemId`/`orderUpdated` — ou seja, nada é lançado no pedido.
"""

import pytest

from services.api_client import ApiClientError, RecordingApiClient
from services.tools import ToolContext, dispatch_tool


UUID_AGUA = "11111111-1111-4111-8111-111111111111"
UUID_AGUA_GAS = "22222222-2222-4222-8222-222222222222"
UUID_RISOTO = "33333333-3333-4333-8333-333333333333"


def _row(item_id: str, name: str, price_cents: int = 790) -> dict:
    """Linha crua do apps/api — snake_case, como o SQL devolve."""
    return {"id": item_id, "name": name, "price_cents": price_cents}


def _ctx(api=None) -> ToolContext:
    return ToolContext(tenant_id="my-rest", customer_id="cust-1", session_id="sess-1", api_client=api)


def _payload(result) -> dict:
    assert result.action_payload is not None
    return result.action_payload


# ─────────────────────────────────────────────────────────────
# itemId já é UUID — caminho INALTERADO (nenhuma chamada HTTP)
# ─────────────────────────────────────────────────────────────


def test_uuid_item_id_resolves_without_touching_the_api():
    api = RecordingApiClient(default={"items": [_row(UUID_AGUA, "Agua Mineral")]})
    result = dispatch_tool("add_to_order", {"itemId": UUID_AGUA, "quantity": 2}, _ctx(api))

    assert result.error is None
    assert api.calls == [], "UUID válido não pode gastar round-trip no cardápio"
    assert _payload(result)["itemId"] == UUID_AGUA
    assert _payload(result)["quantity"] == 2
    assert _payload(result)["orderUpdated"] is True
    assert result.message == "Adicionei 2x ao seu pedido. Quer mais alguma coisa?"


# ─────────────────────────────────────────────────────────────
# Match exato
# ─────────────────────────────────────────────────────────────


def test_exact_name_match_wins_over_the_other_candidate():
    """"Agua Mineral" casa exato mesmo com "Agua Mineral com Gas" no pool."""
    api = RecordingApiClient(queued_responses=[
        {"items": [_row(UUID_AGUA, "Agua Mineral"), _row(UUID_AGUA_GAS, "Agua Mineral com Gas")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "Agua Mineral"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA
    assert api.calls[0][0] == "GET"
    assert api.calls[0][1].startswith("/menu/search?q=")


def test_exact_match_ignores_accent_case_and_plural():
    """"AGUAS" → "Água Mineral"? Não: exato é exato. Aqui: "coxinhas"→"Coxinha"."""
    api = RecordingApiClient(queued_responses=[{"items": [_row(UUID_RISOTO, "Coxinha")]}])
    result = dispatch_tool("add_to_order", {"itemId": "COXINHAS"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_RISOTO


def test_exact_match_strips_article_the_llm_glued_to_the_name():
    api = RecordingApiClient(queued_responses=[{"items": [_row(UUID_AGUA, "Água Mineral")]}])
    result = dispatch_tool("add_to_order", {"itemId": "uma água mineral"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA


# ─────────────────────────────────────────────────────────────
# Candidato único
# ─────────────────────────────────────────────────────────────


def test_single_candidate_is_used_and_enriches_the_payload():
    api = RecordingApiClient(queued_responses=[{"items": [_row(UUID_AGUA, "Agua Mineral", 790)]}])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error is None
    payload = _payload(result)
    assert payload["itemId"] == UUID_AGUA
    assert payload["name"] == "Agua Mineral"
    assert payload["priceCents"] == 790
    assert payload["orderUpdated"] is True
    assert result.message == "Adicionei 1x Agua Mineral ao seu pedido. Quer mais alguma coisa?"
    assert [c["id"] for c in result.chips] == ["view_order", "add_more", "request_check"]


def test_single_candidate_survives_accent_missing_from_the_llm_args():
    """ILIKE do Postgres não é accent-insensitive: `%agua%` não casa "Água".

    A busca volta vazia e o fallback local sobre `/menu/items` resolve.
    """
    api = RecordingApiClient(queued_responses=[
        {"items": []},
        {"items": [_row(UUID_AGUA, "Água Mineral"), _row(UUID_RISOTO, "Risoto de Camarão")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA
    assert [c[1] for c in api.calls] == ["/menu/search?q=agua", "/menu/items"]


def test_single_candidate_matches_tokens_out_of_order():
    api = RecordingApiClient(queued_responses=[
        {"items": []},
        {"items": [_row(UUID_RISOTO, "Risoto de Camarão"), _row(UUID_AGUA, "Água Mineral")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "risoto camarao"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_RISOTO


# ─────────────────────────────────────────────────────────────
# Ambíguo (2+) — PERGUNTA, nunca chuta
# ─────────────────────────────────────────────────────────────


def test_two_candidates_ask_instead_of_guessing():
    api = RecordingApiClient(queued_responses=[
        {"items": [_row(UUID_AGUA, "Agua Mineral"), _row(UUID_AGUA_GAS, "Agua com Gas")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error is None
    assert result.message == "Temos Agua Mineral e Agua com Gas. Qual você quer?"
    assert [c["label"] for c in result.chips] == ["Agua Mineral", "Agua com Gas"]
    assert [c["action"] for c in result.chips] == ["send", "send"]


def test_ambiguous_result_never_mutates_the_order():
    """O invariante que protege a conta do cliente."""
    api = RecordingApiClient(queued_responses=[
        {"items": [_row(UUID_AGUA, "Agua Mineral"), _row(UUID_AGUA_GAS, "Agua com Gas")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    payload = _payload(result)
    assert payload["needsDisambiguation"] is True
    assert payload["query"] == "agua"
    assert payload["candidates"] == [
        {"id": UUID_AGUA, "name": "Agua Mineral"},
        {"id": UUID_AGUA_GAS, "name": "Agua com Gas"},
    ]
    assert "itemId" not in payload
    assert "orderUpdated" not in payload
    assert "cartUpdated" not in payload


def test_three_candidates_are_listed_in_pt_br():
    api = RecordingApiClient(queued_responses=[
        {"items": [
            _row(UUID_AGUA, "Agua Mineral"),
            _row(UUID_AGUA_GAS, "Agua com Gas"),
            _row(UUID_RISOTO, "Agua de Coco"),
        ]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.message == "Temos Agua Mineral, Agua com Gas e Agua de Coco. Qual você quer?"
    assert len(result.chips) == 3


def test_ambiguity_shortlist_is_capped_at_five():
    rows = [_row(f"{i}{i}{i}{i}{i}{i}{i}{i}-1111-4111-8111-111111111111", f"Suco {i}") for i in range(1, 8)]
    api = RecordingApiClient(queued_responses=[{"items": rows}])
    result = dispatch_tool("add_to_order", {"itemId": "suco"}, _ctx(api))

    assert len(result.chips) == 5
    assert len(_payload(result)["candidates"]) == 5


def test_two_items_with_the_same_name_are_ambiguous_too():
    api = RecordingApiClient(queued_responses=[
        {"items": [_row(UUID_AGUA, "Agua Mineral"), _row(UUID_AGUA_GAS, "Água mineral")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua mineral"}, _ctx(api))

    assert _payload(result)["needsDisambiguation"] is True
    assert "itemId" not in _payload(result)


# ─────────────────────────────────────────────────────────────
# Nenhum candidato
# ─────────────────────────────────────────────────────────────


def test_no_candidate_returns_not_found():
    api = RecordingApiClient(queued_responses=[{"items": []}, {"items": []}])
    result = dispatch_tool("add_to_order", {"itemId": "trufa branca"}, _ctx(api))

    assert result.action_payload is None
    assert result.error["code"] == "item_not_found"
    assert "trufa branca" in result.error["message"]


def test_partial_word_does_not_resolve():
    """"gua" não pode virar "Agua Mineral" — match é por palavra inteira."""
    api = RecordingApiClient(queued_responses=[
        {"items": []},
        {"items": [_row(UUID_AGUA, "Agua Mineral")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "gua"}, _ctx(api))

    assert result.error["code"] == "item_not_found"


# ─────────────────────────────────────────────────────────────
# Bordas: sem api_client, erro de API, args inválidos
# ─────────────────────────────────────────────────────────────


def test_name_without_api_client_keeps_the_old_bad_args_error():
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(None))

    assert result.error["code"] == "bad_args"
    assert "UUID" in result.error["message"]


def test_api_failure_surfaces_as_api_error():
    api = RecordingApiClient(raise_on_call=ApiClientError("boom"))
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error["code"] == "api_error"


# `0` fica de fora de propósito: `args.get("quantity") or ... or 1` já
# colapsava 0 → 1 antes desta tarefa. Não mexo nisso aqui.
@pytest.mark.parametrize("quantity", [-1, 21, "muitas"])
def test_bad_quantity_is_rejected_before_any_menu_lookup(quantity):
    api = RecordingApiClient(queued_responses=[{"items": [_row(UUID_AGUA, "Agua Mineral")]}])
    result = dispatch_tool("add_to_order", {"itemId": "agua", "quantity": quantity}, _ctx(api))

    assert result.error["code"] == "bad_args"
    assert api.calls == [], "arg inválido não pode gastar chamada no cardápio"


def test_missing_item_id_still_reports_missing_item():
    result = dispatch_tool("add_to_order", {}, _ctx(RecordingApiClient()))
    assert result.error["code"] == "missing_item"


def test_non_string_item_id_is_rejected_without_lookup():
    api = RecordingApiClient()
    result = dispatch_tool("add_to_order", {"itemId": 42}, _ctx(api))

    assert result.error["code"] == "bad_args"
    assert api.calls == []


def test_rows_without_a_usable_uuid_are_discarded():
    """Linha malformada do cardápio não pode virar candidato."""
    api = RecordingApiClient(queued_responses=[
        {"items": [{"id": "agua", "name": "Agua Mineral"}, _row(UUID_AGUA_GAS, "Agua com Gas")]},
    ])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA_GAS


def test_bare_list_response_shape_is_accepted():
    """`search_dish` aceita `{items:[...]}` OU a lista crua — idem aqui."""
    api = RecordingApiClient(queued_responses=[[_row(UUID_AGUA, "Agua Mineral")]])
    result = dispatch_tool("add_to_order", {"itemId": "agua"}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA


# ─────────────────────────────────────────────────────────────
# Regressao 2026-08-31: "candidato unico" so vale se casou por NOME.
#
# `/menu/search` (apps/api) casa por `name ILIKE` OU `tags @> ARRAY[$2]` OU
# `ingredients @> ARRAY[$2]`. O primeiro corte da tarefa 2C fazia
# `_narrow(...) or pool`, entao um hit unico vindo de INGREDIENTE virava
# "obvio" e era lancado na conta — o cliente pede "limao" e recebe uma
# Caipirinha de R$ 19,90 que nunca pediu. Reproduzido no container antes do fix.
# ─────────────────────────────────────────────────────────────

UUID_CAIPIRINHA = "44444444-4444-4444-8444-444444444444"
UUID_BOLINHO = "55555555-5555-4555-8555-555555555555"
UUID_PICANHA = "66666666-6666-4666-8666-666666666666"


def test_single_hit_by_ingredient_is_not_a_match_and_never_enters_the_order():
    """"limao" so casa a Caipirinha pelo ingrediente — nome nenhum contem "limao"."""
    caipirinha = {"items": [_row(UUID_CAIPIRINHA, "Caipirinha", 1990)]}
    api = RecordingApiClient(queued_responses=[caipirinha, caipirinha])
    result = dispatch_tool("add_to_order", {"itemId": "limao", "quantity": 1}, _ctx(api))

    assert result.error is not None, "hit por ingrediente nao pode virar pedido"
    assert result.error["code"] == "item_not_found"
    assert result.action_payload is None or "itemId" not in (result.action_payload or {})


def test_single_hit_by_tag_is_not_a_match_either():
    """"batata" casaria o Bolinho de Bacalhau por ingrediente — e ele tem alergenos."""
    bolinho = {"items": [_row(UUID_BOLINHO, "Bolinho de Bacalhau", 3290)]}
    api = RecordingApiClient(queued_responses=[bolinho, bolinho])
    result = dispatch_tool("add_to_order", {"itemId": "batata", "quantity": 1}, _ctx(api))

    assert result.error is not None
    assert result.error["code"] == "item_not_found"


def test_stopword_only_query_never_resolves():
    """`itemId="na"` casava a preposicao DENTRO de "Picanha na Brasa" (R$ 78,90)."""
    picanha = {"items": [_row(UUID_PICANHA, "Picanha na Brasa", 7890)]}
    api = RecordingApiClient(queued_responses=[picanha, picanha])
    result = dispatch_tool("add_to_order", {"itemId": "na", "quantity": 1}, _ctx(api))

    assert result.error is not None, "query so de stopword nao pode resolver item nenhum"
    assert result.error["code"] == "item_not_found"


def test_name_match_still_wins_when_search_also_returns_ingredient_noise():
    """O aperto por nome nao pode ter matado o caminho feliz: nome casa, ruido some."""
    api = RecordingApiClient(
        queued_responses=[
            {
                "items": [
                    _row(UUID_CAIPIRINHA, "Caipirinha", 1990),  # veio por ingrediente
                    _row(UUID_AGUA, "Agua Mineral", 790),  # casa por nome
                ]
            }
        ]
    )
    result = dispatch_tool("add_to_order", {"itemId": "agua", "quantity": 1}, _ctx(api))

    assert result.error is None
    assert _payload(result)["itemId"] == UUID_AGUA
    assert _payload(result)["orderUpdated"] is True
