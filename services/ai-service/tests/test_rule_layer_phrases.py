"""
Prompt 100 §4 — bateria de frases REAIS contra o rule-layer sem LLM.

Tabela em dois blocos:
  * POSITIVAS: frases diretas (chips/comandos) que DEVEM resolver no
    rule-layer — `layer` esperado, tool correta e `provider.chat`
    NUNCA chamado (await_count == 0).
  * NEGATIVAS: frases que contêm palavras-gatilho mas precisam de
    raciocínio — DEVEM ir pro LLM (`layer == 'llm'`, await_count > 0).

Toda regra nova em main.py DEVE ganhar linhas aqui. A separação
comando-vs-conversa vem de `_is_direct_phrase` (≤ 6 palavras, sem
negação) — se você mexer no guarda, esta bateria é o contrato.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def chat_client(monkeypatch):
    """TestClient com provider mockado — igual ao de test_tool_invocation."""
    fake_provider = MagicMock()
    fake_provider.chat = AsyncMock(return_value={
        "response": "resposta do llm",
        "tokens_in": 50,
        "tokens_out": 10,
        "model": "qwen2.5-7b-instruct-mlx",
        "tool_calls": [],
    })
    fake_provider.estimate_cost_cents = MagicMock(return_value=1)

    monkeypatch.setattr(main, "get_provider", lambda: fake_provider)
    monkeypatch.setattr(main, "_api_client", None)

    return TestClient(main.app), fake_provider


def _post(client, message: str):
    res = client.post("/chat", json={"message": message, "tenantId": "t1"})
    assert res.status_code == 200, res.text
    return res.json()


def _first_tool(body) -> str | None:
    calls = body.get("tool_calls") or []
    if not calls:
        return None
    fn = calls[0].get("function") or {}
    return fn.get("name")


# ─────────────────────────────────────────────────────────────
# POSITIVAS — resolvem no rule-layer, zero LLM.
# (frase, layer esperado, tool esperada ou None, args parciais esperados)
# ─────────────────────────────────────────────────────────────
POSITIVE_CASES = [
    # Ver cardápio (chips: "Ver cardápio" / comandos diretos)
    ("quero ver o cardápio", "rule-view-menu", "view_menu", {}),
    ("ver cardápio", "rule-view-menu", "view_menu", {}),
    ("abre o cardápio", "rule-view-menu", "view_menu", {}),
    ("mostra o menu", "rule-view-menu", "view_menu", {}),
    ("cardápio", "rule-view-menu", "view_menu", {}),
    ("abre o menu pra mim", "rule-view-menu", "view_menu", {}),
    # Cardápio filtrado por categoria (chips "Ver bebidas"/"Ver sobremesas")
    ("mostra as bebidas", "rule-view-menu", "view_menu", {"category": "bebida"}),
    ("mostra as sobremesas", "rule-view-menu", "view_menu", {"category": "sobremesa"}),
    ("ver sobremesas", "rule-view-menu", "view_menu", {"category": "sobremesa"}),
    ("mostra os pratos principais", "rule-view-menu", "view_menu", {"category": "principal"}),
    ("quais entradas tem?", "rule-view-menu", "view_menu", {"category": "entrada"}),
    # Me indica (sugestão)
    ("me indica algo", "rule-recommend-dish", "recommend_dish", {}),
    ("me indica algo leve", "rule-recommend-dish", "recommend_dish", {}),
    ("indica algo bom pra hoje", "rule-recommend-dish", "recommend_dish", {}),
    ("me recomenda alguma coisa", "rule-recommend-dish", "recommend_dish", {}),
    ("o que você recomenda hoje?", "rule-recommend-dish", "recommend_dish", {}),
    ("me indica uma sobremesa", "rule-recommend-dish", "recommend_dish", {"category": "sobremesa"}),
    ("me indica uma entrada", "rule-recommend-dish", "recommend_dish", {"category": "entrada"}),
    ("me indica um prato principal", "rule-recommend-dish", "recommend_dish", {"category": "principal"}),
    # Ver meu pedido / status (rule pré-existente — não regredir)
    ("ver meu pedido", "rule-order-status", "view_order", {}),
    ("quanto tempo demora o pedido?", "rule-order-status", "view_order", {}),
    ("cadê meu pedido?", "rule-order-status", "view_order", {}),
    # Chamar garçom
    ("chama o garçom", "rule-call-waiter", "call_waiter", {}),
    ("chamar garçom", "rule-call-waiter", "call_waiter", {}),
    ("garçom, por favor", "rule-call-waiter", "call_waiter", {}),
    ("cadê o garçom?", "rule-call-waiter", "call_waiter", {}),
    ("preciso do garçom aqui", "rule-call-waiter", "call_waiter", {}),
    # Pedir a conta / pagar (rule pré-existente + extensões)
    ("quero pagar a conta", "rule-payment", "open_payment_screen", {}),
    ("traz a conta", "rule-payment", "open_payment_screen", {}),
    ("a conta, por favor", "rule-payment", "open_payment_screen", {}),
    ("quero finalizar", "rule-payment", "open_payment_screen", {}),
    ("quero dividir a conta", "rule-payment", "split_bill", {}),
    ("quero pagar só a minha parte", "rule-payment", "pay_individual", {}),
    ("quero pagar tudo", "rule-payment", "pay_full", {}),
    # Cortesias
    ("ver minhas cortesias", "rule-courtesy", "view_courtesy", {}),
    ("tem alguma cortesia?", "rule-courtesy", "view_courtesy", {}),
    # Falar com gerente (sem tool — pede o texto; followup envia)
    ("quero falar com o gerente", "rule-manager-intent", None, {}),
    ("chama o gerente", "rule-manager-intent", None, {}),
    # Sem glúten direto (rule pré-existente, agora com guarda de frase direta)
    ("opções sem glúten", "rule-gluten-free-recommendation", "recommend_dish", {"dietary": "gluten_free"}),
]


@pytest.mark.parametrize(
    "message, expected_layer, expected_tool, expected_args",
    POSITIVE_CASES,
    ids=[c[0] for c in POSITIVE_CASES],
)
def test_direct_phrase_resolves_without_llm(
    chat_client, message, expected_layer, expected_tool, expected_args
):
    client, provider = chat_client
    body = _post(client, message)

    assert body["layer"] == expected_layer, (
        f"{message!r}: layer={body['layer']!r}, esperado {expected_layer!r}"
    )
    assert provider.chat.await_count == 0, f"{message!r} gastou LLM"
    assert _first_tool(body) == expected_tool

    if expected_tool is not None:
        args = (body["tool_calls"][0].get("function") or {}).get("arguments") or {}
        for key, value in expected_args.items():
            assert args.get(key) == value, (
                f"{message!r}: args[{key}]={args.get(key)!r}, esperado {value!r}"
            )
        # UX de IA: rule-layer responde com texto (bubble) + tool indicator.
        assert isinstance(body["response"], str)
        assert body["model"] == "rule-layer"
        assert body["provider"] == "local"


def test_manager_intent_reply_keeps_followup_contract(chat_client):
    """A resposta do rule-manager-intent precisa casar o regex do followup."""
    client, provider = chat_client
    body = _post(client, "quero falar com o gerente")
    assert provider.chat.await_count == 0
    assert main._MANAGER_MESSAGE_PROMPT_RE.search(body["response"]) is not None


def test_manager_intent_then_followup_sends_without_llm(chat_client):
    """Turno 1: intenção → pede texto. Turno 2: texto vira tool, sem LLM."""
    client, provider = chat_client
    first = _post(client, "quero falar com o gerente")
    res = client.post(
        "/chat",
        json={
            "message": "a comida demorou demais hoje, fiquei chateado",
            "tenantId": "t1",
            "history": [
                {"role": "user", "content": "quero falar com o gerente"},
                {"role": "assistant", "content": first["response"]},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["layer"] == "rule-manager-message-followup"
    assert _first_tool(body) == "send_message_to_manager"
    assert provider.chat.await_count == 0


# ─────────────────────────────────────────────────────────────
# NEGATIVAS — palavras-gatilho no meio, mas precisam de raciocínio: LLM.
# ─────────────────────────────────────────────────────────────
NEGATIVE_CASES = [
    "qual prato combina com vinho tinto?",
    "tem algo sem glúten que chegue rápido?",
    "meu pedido veio errado, o que você sugere?",
    "não quero ver o cardápio agora, me fala de você",
    "não quero pagar agora",
    "o garçom foi grosso comigo",
    "queria entender como funciona a divisão da conta entre quatro pessoas",
    "a sobremesa que eu pedi tá demorando muito, isso é normal?",
    "me fala sobre a história do restaurante",
    "quero saber se o cardápio tem opções veganas pra minha esposa",
    "me indica algo que combine com o risoto que meu amigo pediu",
    "o menu de vocês muda com a estação do ano?",
    "quero adicionar 1 risoto",
    "tem prato com camarão?",
    "que sobremesa combina com peixe?",
    # SEGURANÇA ALIMENTAR (decisão Caleb 2026-06-12): recomendação com
    # restrição/alergia vai pro LLM — o rule-layer genérico não filtra
    # alérgenos e poderia sugerir exatamente o que a pessoa não pode.
    "me indica algo sem camarão",
    "me indica algo sem lactose",
    "me indica algo vegano",
    "me recomenda algo sem amendoim",
    "sugere algo pra alérgico",
    "me indica algo sem cebola",
]


@pytest.mark.parametrize("message", NEGATIVE_CASES, ids=NEGATIVE_CASES)
def test_reasoning_phrase_goes_to_llm(chat_client, message):
    client, provider = chat_client
    body = _post(client, message)
    assert body["layer"] == "llm", (
        f"{message!r}: caiu em {body['layer']!r} — o rule-layer engoliu uma frase de raciocínio"
    )
    assert provider.chat.await_count > 0, f"{message!r} não chegou ao LLM"
