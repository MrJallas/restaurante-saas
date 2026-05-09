"""Tests for the 4th classification layer (`detect_ack`) + the
allow-list intent layer (`is_allowed_intent`, P1 #27)."""

import pytest

from services.classify_ack import detect_ack, AckResult, is_allowed_intent


@pytest.mark.parametrize("text", [
    "ok", "okay", "Ok!", "OK.",
    "valeu", "vlw", "obrigado", "obrigada",
    "show", "top", "blz", "beleza",
    "perfeito", "ótimo", "uhum", "claro",
    "👍", "👌",
    "tá bom", "ok então", "muito obrigada",
])
def test_detects_acks(text: str):
    result = detect_ack(text)
    assert isinstance(result, AckResult), f"expected ack for {text!r}"
    assert result.kind == "ack"
    assert result.confidence > 0.8


@pytest.mark.parametrize("text", [
    "quero pedir um hambúrguer",
    "qual o prato do dia?",
    "obrigado pelo atendimento mas queria reclamar",  # too long for ack
    "👍 chama o garçom",  # mixed emoji+text → not ack-only
    "",
    "   ",
])
def test_skips_non_acks(text: str):
    assert detect_ack(text) is None


def test_emoji_only_detected():
    res = detect_ack("👌")
    assert res is not None
    assert res.matched in {"emoji-only", "👌"}


def test_returns_none_for_empty():
    assert detect_ack("") is None
    assert detect_ack(None or "") is None


# ─────────────────────────────────────────────────────────────
# P1 #27 — allow-list of legitimate restaurant intents
# These were being incorrectly bounced with `block_reason='classifier'`.
# `is_allowed_intent` lets them through to the LLM with confidence=0.95.
# ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("text", [
    # Modify-order intents (the core of #27)
    "tira a cebola",
    "sem queijo no hambúrguer",
    "pode adicionar bacon",
    "coloca mais molho",
    "com menos sal",
    # Check-request
    "quero pedir a conta",
    "pode trazer a conta",
    "queria fechar a conta",
    "vamos pagar",
    # Order modification
    "trocar pedido",
    "quero cancelar o item",
    "mudar a bebida",
    # Allergen
    "tem glúten?",
    "esse prato é sem lactose?",
    "vocês têm opção vegana?",
    # Add-to-order phrasings
    "quero o risoto de cogumelos",
    "me traz uma água",
    "vou querer a sobremesa",
    # Waiter/help
    "chama o garçom",
    "preciso falar com o gerente",
    # Table merge
    "junta com a mesa 5",
    "queria juntar minha mesa com a 3",
])
def test_allow_list_lets_legit_intents_through(text: str):
    assert is_allowed_intent(text) is True, f"expected allow-list to pass: {text!r}"


@pytest.mark.parametrize("text", [
    # Off-topic — must NOT match the allow-list
    "qual a previsão do tempo?",
    "me conte uma piada",
    "",
    "   ",
])
def test_allow_list_does_not_match_offtopic(text: str):
    assert is_allowed_intent(text) is False, f"unexpected allow-list match: {text!r}"


def test_classify_endpoint_does_not_block_modify_order_intents(monkeypatch):
    """Integration: /classify with 'tira a cebola' must NOT block."""
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": "tira a cebola"})
    body = res.json()
    assert body["allowed"] is True
    # The reason should be the new allow_list layer, never 'classifier' nor 'regex'.
    assert body["reason"] in {"allow_list", "ack", "greeting", "short-followup"}


def test_classify_endpoint_does_not_block_check_request():
    """Integration: /classify with 'quero pedir a conta' must NOT block."""
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": "quero pedir a conta"})
    body = res.json()
    assert body["allowed"] is True
    assert body["reason"] != "classifier"
