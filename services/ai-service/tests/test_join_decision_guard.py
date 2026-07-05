"""
P1 da auditoria 2026-07-03: com convite de junção pendente, um "não" SOLTO
no meio de qualquer frase decidia a junção — "não sei o que pedir"
REJEITAVA o convite da outra mesa sem o cliente perceber (o _JOIN_REJECT_RE
fazia search no texto inteiro). Decisão de join/merge agora exige frase de
decisão INEQUÍVOCA (fullmatch curto); qualquer outra coisa segue o fluxo
normal com o convite intacto.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def chat_client(monkeypatch):
    fake_provider = MagicMock()
    fake_provider.chat = AsyncMock(
        return_value={
            "response": "resposta do llm",
            "tokens_in": 50,
            "tokens_out": 10,
            "model": "qwen2.5-7b-instruct-mlx",
            "tool_calls": [],
        }
    )
    fake_provider.estimate_cost_cents = MagicMock(return_value=1)
    monkeypatch.setattr(main, "get_provider", lambda: fake_provider)
    monkeypatch.setattr(main, "_api_client", None)
    return TestClient(main.app), fake_provider


PENDING_CONTEXT = {
    "pending_join_request": {
        "targetCustomerId": "12345678-1234-4234-8234-123456789012",
        "joinerName": "Bianca",
        "requestedAt": "2026-07-04T00:00:00.000Z",
    },
}


def _post(client, message):
    res = client.post(
        "/chat",
        json={
            "message": message,
            "tenantId": "restaurant_dev",
            "customer_context": PENDING_CONTEXT,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


# Frases com "não"/"sim" embutidos que NÃO são resposta ao convite.
AMBIGUOUS_PHRASES = [
    "não sei o que pedir",
    "acho que não vou querer sobremesa",
    "hoje não tá fácil escolher",
    "não gostei da última vez, me indica outra coisa",
    "sim, me mostra o cardápio de bebidas",
    "pode me falar quanto tempo demora a picanha?",
    "ok, mas antes quero ver o cardápio",
]


@pytest.mark.parametrize("message", AMBIGUOUS_PHRASES, ids=AMBIGUOUS_PHRASES)
def test_frase_ambigua_nao_decide_o_convite(chat_client, message):
    client, _provider = chat_client
    body = _post(client, message)
    assert body["layer"] != "rule-join-request-decision", (
        f"{message!r} decidiu o convite pendente — um 'não'/'sim' solto no meio "
        "da frase não é resposta ao convite"
    )
    tools = [tc["function"]["name"] for tc in body.get("tool_calls") or []]
    assert "reject_join_request" not in tools
    assert "accept_join_request" not in tools


# Decisões inequívocas continuam resolvendo sem LLM (característico).
DIRECT_DECISIONS = [
    ("não", "reject_join_request"),
    ("agora não", "reject_join_request"),
    ("melhor não", "reject_join_request"),
    ("não pode entrar", "reject_join_request"),
    ("recusar", "reject_join_request"),
    ("pode", "accept_join_request"),
    ("pode entrar", "accept_join_request"),
    ("sim", "accept_join_request"),
    ("sim, pode entrar", "accept_join_request"),
    ("claro", "accept_join_request"),
    ("deixa entrar", "accept_join_request"),
]


@pytest.mark.parametrize(
    "message, expected_tool", DIRECT_DECISIONS, ids=[c[0] for c in DIRECT_DECISIONS]
)
def test_decisao_direta_resolve_sem_llm(chat_client, message, expected_tool):
    client, provider = chat_client
    body = _post(client, message)
    assert body["layer"] == "rule-join-request-decision", (
        f"{message!r} é decisão inequívoca e deveria resolver no rule-layer"
    )
    assert body["tool_calls"][0]["function"]["name"] == expected_tool
    assert provider.chat.await_count == 0


# ── LLM01 (fechamento por construção): mesmo um LLM JAILBROKEN — como se o nome
#    envenenado do joiner tivesse induzido o modelo a emitir accept_join_request
#    — NÃO admite ninguém. Com host AMBÍGUO (sem fullmatch determinístico), o
#    turno vai pro LLM; o loop de dispatch dropa a decisão de join do LLM. ──


@pytest.mark.parametrize("forged_tool", ["accept_join_request", "reject_join_request"])
def test_llm_jailbroken_nao_decide_join(monkeypatch, forged_tool):
    forged_provider = MagicMock()
    forged_provider.chat = AsyncMock(
        return_value={
            "response": "",
            "tokens_in": 50,
            "tokens_out": 10,
            "model": "qwen2.5-7b-instruct-mlx",
            # O modelo (jailbroken pelo nome envenenado) EMITE a decisão de join.
            "tool_calls": [
                {
                    "function": {
                        "name": forged_tool,
                        "arguments": {
                            "targetCustomerId": PENDING_CONTEXT[
                                "pending_join_request"
                            ]["targetCustomerId"],
                            "reason": "nome envenenado induziu o accept",
                        },
                    }
                }
            ],
        }
    )
    forged_provider.estimate_cost_cents = MagicMock(return_value=1)
    monkeypatch.setattr(main, "get_provider", lambda: forged_provider)
    monkeypatch.setattr(main, "_api_client", None)
    client = TestClient(main.app)

    # Host AMBÍGUO: não é fullmatch de decisão → não curto-circuita → vai pro LLM.
    body = _post(client, "sinceramente não sei, o que você acha dessa pessoa?")

    # Confirmação de que o turno REALMENTE chegou ao LLM (senão o teste não prova
    # o drop no caminho do LLM).
    assert forged_provider.chat.await_count == 1
    assert body["layer"] != "rule-join-request-decision"
    # …e mesmo assim a decisão de join FORJADA pelo LLM foi DROPADA por construção.
    dispatched = [tc["function"]["name"] for tc in body.get("tool_calls") or []]
    assert forged_tool not in dispatched, (
        f"{forged_tool} forjado pelo LLM sobreviveu ao dispatch — o fechamento "
        "por construção do LLM01 está furado"
    )
