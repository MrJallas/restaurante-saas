"""
Tests for the tool-invocation pipeline (P0 #5).

Covers:
  1. The OpenAI provider forwards `tools=[...]` to the underlying API call
     so LM Studio actually sees the function schemas.
  2. The provider parses tool_calls back into the normalised dict shape.
  3. The `/chat` endpoint dispatches each tool_call through the registry
     with the api_client wired into the ToolContext.
  4. Tool schemas are well-formed (qwen2.5-7b · LM Studio is strict).
"""

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import main
from services.tools.schemas import get_tool_schemas, get_canonical_tool_schema_names
from services.tools import CANONICAL_TOOL_NAMES


def _run(coro):
    """Helper: run an async coroutine in the current loop. Avoids pytest-asyncio dependency."""
    return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)


def _openai_or_skip():
    """Skip a test when the openai SDK isn't installed (some CI environments)."""
    try:
        import openai  # noqa: F401
    except ImportError:
        pytest.skip("openai SDK not installed — provider tests need it")


# ─────────────────────────────────────────────────────────────
# Schema sanity (LM Studio is strict)
# ─────────────────────────────────────────────────────────────


def test_canonical_set_matches_schema_set():
    """Every canonical tool name must have a schema entry, and vice versa."""
    assert get_canonical_tool_schema_names() == CANONICAL_TOOL_NAMES, (
        f"\nMissing schemas: {CANONICAL_TOOL_NAMES - get_canonical_tool_schema_names()}\n"
        f"Extra schemas:   {get_canonical_tool_schema_names() - CANONICAL_TOOL_NAMES}"
    )


@pytest.mark.parametrize("schema", get_tool_schemas(), ids=lambda s: s["function"]["name"])
def test_schema_shape_lmstudio_compatible(schema: dict):
    """
    LM Studio (qwen2.5-7b) requires:
      - type: "function"
      - function.name: str
      - function.parameters.type: "object"
      - function.parameters.required: list (NEVER null — empty [] is fine)
    """
    assert schema["type"] == "function"
    fn = schema["function"]
    assert isinstance(fn["name"], str) and fn["name"]
    assert isinstance(fn["description"], str) and fn["description"]
    params = fn["parameters"]
    assert params["type"] == "object"
    assert isinstance(params["properties"], dict)
    assert isinstance(params["required"], list)
    # Each `required` entry must reference a defined property
    for r in params["required"]:
        assert r in params["properties"], f"required {r!r} not in properties of {fn['name']}"


# ─────────────────────────────────────────────────────────────
# OpenAI provider forwards `tools=` and parses tool_calls back
# ─────────────────────────────────────────────────────────────


def test_openai_provider_forwards_tools_kwarg():
    """
    Root cause for P0 #5: tools=[...] was never passed to LM Studio's
    OpenAI-compat call. This test asserts the kwarg is forwarded.
    """
    _openai_or_skip()
    from services.llm.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider(api_key="test", base_url="http://localhost:1234/v1")

    fake_response = MagicMock()
    fake_response.choices = [MagicMock()]
    fake_response.choices[0].message.content = ""
    fake_response.choices[0].message.tool_calls = None
    fake_response.usage.prompt_tokens = 10
    fake_response.usage.completion_tokens = 5

    create_mock = AsyncMock(return_value=fake_response)
    provider.client.chat.completions.create = create_mock

    schemas = get_tool_schemas()
    _run(provider.chat(
        messages=[{"role": "user", "content": "quero um risoto"}],
        model="qwen2.5-7b-instruct-mlx",
        tools=schemas,
    ))

    assert create_mock.await_count == 1
    kwargs = create_mock.await_args.kwargs
    assert "tools" in kwargs, "tools kwarg MUST be forwarded to LM Studio"
    assert kwargs["tools"] == schemas
    assert kwargs.get("tool_choice") == "auto"


def test_openai_provider_omits_tools_when_none():
    """When tools=None, the kwarg must NOT be sent (LM Studio rejects null)."""
    _openai_or_skip()
    from services.llm.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider(api_key="test")

    fake_response = MagicMock()
    fake_response.choices = [MagicMock()]
    fake_response.choices[0].message.content = "olá"
    fake_response.choices[0].message.tool_calls = None
    fake_response.usage.prompt_tokens = 1
    fake_response.usage.completion_tokens = 1

    create_mock = AsyncMock(return_value=fake_response)
    provider.client.chat.completions.create = create_mock

    _run(provider.chat(
        messages=[{"role": "user", "content": "oi"}],
        model="m",
    ))

    kwargs = create_mock.await_args.kwargs
    assert "tools" not in kwargs


def test_openai_provider_parses_tool_calls_back():
    """LM Studio returns tool_calls — we must surface them as a normalised list."""
    _openai_or_skip()
    from services.llm.providers.openai_provider import OpenAIProvider

    provider = OpenAIProvider(api_key="test")

    fn_obj = MagicMock()
    fn_obj.name = "add_to_order"
    fn_obj.arguments = json.dumps({"itemId": "risoto-123", "quantity": 1})

    tc_obj = MagicMock()
    tc_obj.id = "call_abc"
    tc_obj.type = "function"
    tc_obj.function = fn_obj

    fake_response = MagicMock()
    fake_response.choices = [MagicMock()]
    fake_response.choices[0].message.content = ""
    fake_response.choices[0].message.tool_calls = [tc_obj]
    fake_response.usage.prompt_tokens = 50
    fake_response.usage.completion_tokens = 10

    provider.client.chat.completions.create = AsyncMock(return_value=fake_response)

    out = _run(provider.chat(
        messages=[{"role": "user", "content": "quero adicionar 1 risoto"}],
        model="qwen",
        tools=get_tool_schemas(),
    ))

    assert out["tool_calls"] is not None and len(out["tool_calls"]) == 1
    tc = out["tool_calls"][0]
    assert tc["id"] == "call_abc"
    assert tc["type"] == "function"
    assert tc["function"]["name"] == "add_to_order"
    assert tc["function"]["arguments"] == {"itemId": "risoto-123", "quantity": 1}


# ─────────────────────────────────────────────────────────────
# /chat endpoint integration — full P0 #5 acceptance test
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def chat_client(monkeypatch):
    """FastAPI test client with a mocked LLM provider."""
    fake_provider = MagicMock()
    fake_provider.chat = AsyncMock(return_value={
        "response": "",
        "tokens_in": 50,
        "tokens_out": 10,
        "model": "qwen2.5-7b-instruct-mlx",
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "add_to_order",
                    "arguments": {"itemId": "12345678-1234-4234-8234-123456789012", "quantity": 1},
                },
            }
        ],
    })
    fake_provider.estimate_cost_cents = MagicMock(return_value=1)

    monkeypatch.setattr(main, "get_provider", lambda: fake_provider)
    # Disable api_client so add_to_order doesn't try to hit a real backend.
    monkeypatch.setattr(main, "_api_client", None)

    return TestClient(main.app), fake_provider


def test_chat_endpoint_passes_tools_to_llm(chat_client):
    """The `/chat` handler MUST pass tool schemas to the LLM (P0 #5 root cause)."""
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "quero adicionar 1 risoto",
            "tenantId": "t1",
            "tenant_context": {"restaurant_name": "Casa do Risoto"},
        },
    )
    assert res.status_code == 200, res.text
    # provider.chat called once with tools= populated
    assert provider.chat.await_count == 1
    kwargs = provider.chat.await_args.kwargs
    assert "tools" in kwargs
    assert len(kwargs["tools"]) > 0
    # Quick smoke check: the canonical tool list is what we sent.
    names = {t["function"]["name"] for t in kwargs["tools"]}
    assert "add_to_order" in names


def test_chat_endpoint_returns_dispatched_tool_calls(chat_client):
    """When the LLM emits tool_calls, the response carries them populated."""
    client, _ = chat_client
    res = client.post(
        "/chat",
        json={"message": "quero adicionar 1 risoto", "tenantId": "t1"},
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["tool_calls"], list)
    assert len(body["tool_calls"]) == 1
    tc = body["tool_calls"][0]
    assert tc["function"]["name"] == "add_to_order"
    # Dispatcher attached the result envelope so apps/api can persist it.
    assert "result" in tc
    assert tc["result"]["error"] is None


def test_chat_endpoint_falls_back_to_tool_message_when_llm_text_empty(chat_client):
    """When the LLM only emits tool_calls (no text), the bubble shows the tool message."""
    client, _ = chat_client
    res = client.post(
        "/chat",
        json={"message": "quero adicionar 1 risoto", "tenantId": "t1"},
    )
    body = res.json()
    # add_to_order returns "Adicionei 1x ao seu pedido. Quer mais alguma coisa?"
    assert "Adicionei" in body["response"]


def test_chat_routes_order_eta_question_to_view_order_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={"message": "quanto tempo demora o pedido?", "tenantId": "t1"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-order-status"
    assert body["tool_calls"][0]["function"]["name"] == "view_order"
    assert provider.chat.await_count == 0


def test_chat_routes_view_order_request_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={"message": "olhar meu pedido", "tenantId": "t1"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-order-status"
    assert body["tool_calls"][0]["function"]["name"] == "view_order"
    assert provider.chat.await_count == 0


def test_chat_routes_payment_request_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={"message": "quero pagar a conta", "tenantId": "t1"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-payment"
    assert body["tool_calls"][0]["function"]["name"] == "open_payment_screen"
    assert provider.chat.await_count == 0


def test_chat_routes_gluten_free_options_to_recommendation_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={"message": "opções sem glúten", "tenantId": "t1"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-gluten-free-recommendation"
    assert body["tool_calls"][0]["function"]["name"] == "recommend_dish"
    assert body["tool_calls"][0]["function"]["arguments"]["dietary"] == "gluten_free"
    assert provider.chat.await_count == 0


def test_chat_answers_approved_table_merge_status_without_tools(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "a outra mesa aceitou? as mesas ja estao juntas?",
            "tenantId": "t1",
            "customer_context": {
                "latest_table_merge": {
                    "status": "approved",
                    "origin_table_number": 14,
                    "target_table_number": 15,
                    "approved_by_a_at": "2026-05-28T20:41:42.513Z",
                    "approved_by_b_at": "2026-05-28T20:41:43.833Z",
                },
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-table-merge-status"
    assert body["response"] == (
        "Sim, as mesas 14 e 15 já estão juntas. "
        "Vocês podem escolher se juntam as comandas ou continuam separadas."
    )
    assert body["tool_calls"] == []
    assert provider.chat.await_count == 0


def test_chat_answers_pending_table_merge_status_without_tools(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "a outra mesa aceitou?",
            "tenantId": "t1",
            "customer_context": {
                "latest_table_merge": {
                    "status": "pending",
                    "origin_table_number": 14,
                    "target_table_number": 15,
                    "approved_by_a_at": "2026-05-28T20:41:42.513Z",
                    "approved_by_b_at": None,
                },
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-table-merge-status"
    assert "falta a outra mesa aceitar" in body["response"]
    assert body["tool_calls"] == []
    assert provider.chat.await_count == 0


def test_chat_routes_join_accept_before_ack_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "pode",
            "tenantId": "restaurant_dev",
            "customer_context": {
                "pending_join_request": {
                    "targetCustomerId": "12345678-1234-4234-8234-123456789012",
                    "joinerName": "Bianca",
                    "requestedAt": "2026-05-28T15:20:00.000Z",
                },
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-join-request-decision"
    assert body["tool_calls"][0]["function"]["name"] == "accept_join_request"
    assert body["tool_calls"][0]["function"]["arguments"]["targetCustomerId"] == (
        "12345678-1234-4234-8234-123456789012"
    )
    assert body["tool_calls"][0]["result"]["actionPayload"]["decision"] == "approve"
    assert provider.chat.await_count == 0


def test_chat_routes_join_reject_before_ack_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "agora não",
            "tenantId": "restaurant_dev",
            "customer_context": {
                "pending_join_request": {
                    "targetCustomerId": "12345678-1234-4234-8234-123456789012",
                    "joinerName": "Bianca",
                },
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-join-request-decision"
    assert body["tool_calls"][0]["function"]["name"] == "reject_join_request"
    assert body["tool_calls"][0]["result"]["actionPayload"]["decision"] == "reject"
    assert provider.chat.await_count == 0


def test_chat_manager_message_followup_uses_manager_tool_without_llm(chat_client):
    client, provider = chat_client
    res = client.post(
        "/chat",
        json={
            "message": "Estou frustrado com o pedido",
            "tenantId": "t1",
            "history": [
                {
                    "role": "assistant",
                    "content": "Olá Caleb! Posso te ajudar a enviar uma mensagem para o gerente. Me conte o que você gostaria de comunicar, por favor.",
                }
            ],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["layer"] == "rule-manager-message-followup"
    assert body["tool_calls"][0]["function"]["name"] == "send_message_to_manager"
    assert body["tool_calls"][0]["function"]["arguments"]["text"] == "Estou frustrado com o pedido"
    assert provider.chat.await_count == 0
