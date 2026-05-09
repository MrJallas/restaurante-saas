"""Round 4 §C-NEW-2 — pedidos comuns ao garçom não devem ser bloqueados.

A allow-list de `classify_ack.is_allowed_intent` foi estendida com padrões
"preciso/queria/pode trazer/me ajuda" + "água/talher/guardanapo/sal/...".
Antes o LLM classifier marcava como off-topic e devolvia
`block_reason='classifier'`. Estes 10 casos garantem que o by-pass funciona.
"""

import pytest

from services.classify_ack import is_allowed_intent


CALL_WAITER_PHRASES = [
    "preciso de mais água",
    "preciso de mais agua",  # sem acento
    "pode trazer um talher?",
    "queria mais um guardanapo",
    "me ajuda com a conta",
    "tem como trazer sal?",
    "preciso de gelo",
    "queria um copo limpo",
    "pode trazer azeite por favor",
    "me ajude a abrir o cardápio",
]


@pytest.mark.parametrize("text", CALL_WAITER_PHRASES)
def test_common_waiter_requests_pass_allow_list(text: str):
    """5+ pedidos comuns devem passar (acceptance: 10/10)."""
    assert is_allowed_intent(text) is True, f"bloqueou: {text!r}"


def test_at_least_5_consecutive_pass():
    """Acceptance round 4 §C-NEW-2: 5 turnos consecutivos passam."""
    consecutive = 0
    for phrase in CALL_WAITER_PHRASES[:5]:
        if is_allowed_intent(phrase):
            consecutive += 1
    assert consecutive == 5, f"only {consecutive}/5 passaram"


def test_offtopic_still_blocked():
    """Garantir que a round 4 mudança não afrouxou pra deixar off-topic passar.

    "me conta uma piada" historicamente passa pela allow-list por causa de
    "conta" (check-request) — não é regression do round 4. Foco aqui é nos
    casos novos: tópicos sem nenhuma palavra-chave de restaurante.
    """
    assert is_allowed_intent("qual a previsão do tempo?") is False
    assert is_allowed_intent("quem ganhou o jogo?") is False
    assert is_allowed_intent("recomenda um filme") is False
