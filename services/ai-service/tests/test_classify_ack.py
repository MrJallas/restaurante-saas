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
    "quanto tempo demora o pedido?",
    "cadê meu pedido?",
    "qual o status do meu pedido?",
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
    # Courtesy/history tools
    "tenho cortesia ativa?",
    "quero ver minhas conversas",
    "abrir histórico de chat",
    "apagar histórico de conversas",
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


@pytest.mark.parametrize("message", [
    "tenho cortesia ativa?",
    "quero ver minhas conversas",
    "abrir histórico de chat",
])
def test_classify_endpoint_does_not_block_secondary_tools(message: str):
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": message})
    body = res.json()
    assert body["allowed"] is True
    assert body["reason"] == "allow_list"


# ─────────────────────────────────────────────────────────────
# P1-H (security/safety) — blocked content must NEVER be "allowed"
# just because a verb+noun heuristic in the allow-list matches.
#
# `is_allowed_intent` casa "quero mais sexo" / "quero mais maconha" /
# "quero votar no lula" via `(...|mais)\s+\w+` e `(quero|...)\s+\w+`,
# ao mesmo tempo em que essas frases batem em BLOCKED_PATTERNS
# (sexo / maconha / lula+voto). Se o allow-list rodar ANTES do
# check_blocked no /classify, o gate de custo-zero vaza sexo/drogas/
# política. `check_blocked` DEVE preceder `is_allowed_intent`.
# ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("message", [
    "quero mais sexo",       # sexo — casa allow-list ('mais \w+' / 'quero \w+')
    "quero mais maconha",    # droga — mesma heurística
    "quero votar no lula",   # política — 'quero \w+' + voto/lula bloqueado
])
def test_classify_endpoint_blocks_disallowed_even_if_allow_list_matches(message: str):
    """P1-H: conteúdo bloqueado nunca deve virar 'allowed' por casar heurística.

    Estas frases casam SIMULTANEAMENTE a allow-list (verbo+substantivo) e os
    BLOCKED_PATTERNS. O endpoint deve devolver allowed=False, reason='regex'.
    """
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": message})
    body = res.json()
    assert body["allowed"] is False, f"vazou blocked como allowed: {message!r} -> {body}"
    assert body["reason"] == "regex", f"esperava regex block, veio: {body}"


@pytest.mark.parametrize("message", [
    "quero mais batata frita",   # caminho feliz: pedir mais comida
    "quero fazer um pedido",     # caminho feliz: abrir pedido
    "tira a cebola",             # modify-order canônico
])
def test_classify_endpoint_happy_path_still_allowed(message: str):
    """Reordenar blocked→antes→allow NÃO pode quebrar intents legítimos."""
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": message})
    body = res.json()
    assert body["allowed"] is True, f"caminho feliz bloqueado: {message!r} -> {body}"
    assert body["reason"] != "regex", f"caminho feliz caiu no regex block: {body}"


@pytest.mark.parametrize("message,expected_reason", [
    ("oi", "greeting"),
    ("bom dia", "greeting"),
    ("obrigado", "ack"),
    ("valeu", "ack"),
])
def test_classify_endpoint_greeting_ack_not_swept_by_block(message: str, expected_reason: str):
    """Saudações/acks legítimos continuam sendo greeting/ack, não blocked."""
    from fastapi.testclient import TestClient
    import main

    client = TestClient(main.app)
    res = client.post("/classify", json={"message": message})
    body = res.json()
    assert body["allowed"] is True
    assert body["reason"] == expected_reason, f"{message!r} -> {body}"
