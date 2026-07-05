"""
A09 (framework bugfix): a erasure tool fabricava sucesso.

Quando o backend `/lgpd-requests` FALHA (lança), o tool engolia a exceção
(`except Exception: pass`) e MESMO ASSIM retornava:
  - message = LGPD_ERASURE_CONFIRMATION ("Suas conversas foram apagadas agora.")
  - action_payload.lgpdErasure.status = 'fulfilled'
  - protocolNumber minta do lado do cliente

Ou seja: afirmava pro cliente que os dados foram apagados quando NADA foi
apagado. É o único tool que mente sucesso com o backend caído.

RED: com backend lançando, o tool NÃO pode afirmar apagamento nem retornar
'fulfilled'. GREEN: status honesto (error/pending) + copy que não afirma
que os dados foram apagados.
"""

from services.tools import lgpd_data_request
from services.tools.types import ToolContext
from services.lgpd_messages import LGPD_ERASURE_CONFIRMATION


def _ctx_with_failing_backend() -> ToolContext:
    def boom(method, path, body=None):
        raise RuntimeError("backend down: 500 from /lgpd-requests")

    return ToolContext(
        tenant_id="restaurant_dev",
        customer_id="cust-123",
        api_client=boom,
        raw_message="quero apagar meus dados",
    )


def test_backend_failure_does_not_claim_erasure():
    res = lgpd_data_request.call({"type": "erasure"}, _ctx_with_failing_backend())

    status = (res.action_payload or {}).get("lgpdErasure", {}).get("status")
    assert status != "fulfilled", (
        "backend falhou mas o tool ainda marcou status='fulfilled' — mente sucesso"
    )
    assert status in {"error", "pending", "failed"}, (
        f"status honesto esperado (error/pending/failed), veio {status!r}"
    )


def test_backend_failure_message_does_not_affirm_data_deleted():
    res = lgpd_data_request.call({"type": "erasure"}, _ctx_with_failing_backend())

    assert res.message != LGPD_ERASURE_CONFIRMATION, (
        "com backend caído o tool não pode devolver a confirmação canônica "
        "de apagamento — isso afirma que os dados foram apagados"
    )
    # A copy honesta não pode afirmar apagamento consumado.
    assert "foram apagadas agora" not in (res.message or ""), (
        "mensagem afirma apagamento consumado com backend caído"
    )


def test_backend_success_still_confirms():
    """Guarda de não-regressão: caminho feliz mantém copy canônica + fulfilled."""

    def ok(method, path, body=None):
        return {"protocolNumber": "LGPD-2026-07-05-ABCD"}

    ctx = ToolContext(
        tenant_id="restaurant_dev",
        customer_id="cust-123",
        api_client=ok,
        raw_message="quero apagar meus dados",
    )
    res = lgpd_data_request.call({"type": "erasure"}, ctx)
    assert res.message == LGPD_ERASURE_CONFIRMATION
    payload = (res.action_payload or {}).get("lgpdErasure", {})
    assert payload.get("status") == "fulfilled"
    assert payload.get("protocolNumber") == "LGPD-2026-07-05-ABCD"
    assert payload.get("backendDispatched") is True
