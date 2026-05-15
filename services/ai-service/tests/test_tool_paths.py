"""
Tests for the 4 tool URL paths fixed under P0 #6.

Each test injects a `RecordingApiClient` into the ToolContext and asserts
the (method, path, body) tuple matches the canonical `apps/api` route. The
canonical routes were validated against the corresponding NestJS controllers:

  - request_table_merge → POST /:slug/table-merge-requests
    (apps/api/src/modules/table-merge/table-merge.controller.ts L66)
  - delete_chat         → DELETE /:slug/chat-history/threads/:threadId
    (apps/api/src/modules/chat-history/chat-history.controller.ts L49)
  - delete_all_chats    → DELETE /:slug/chat-history?customerId=…
    (apps/api/src/modules/chat-history/chat-history.controller.ts L60)
  - send_message_to_manager → NO direct HTTP call (round 22)
    A persistência roda server-side em apps/api `AssistantService`, que
    chama `CustomerStaffMessagesService.appendOutbound()` depois da
    dispatch. A tool retorna apenas message+chips+action_payload pro FE.

`view_courtesy` is intentionally a silent navigation tool now — there is
no `/courtesy` endpoint on apps/api. We assert it does NOT call api_client.
"""

import pytest

from services.tools import dispatch_tool, ToolContext
from services.api_client import RecordingApiClient


# ─────────────────────────────────────────────────────────────
# request_table_merge → POST /:slug/table-merge-requests
# ─────────────────────────────────────────────────────────────


def test_request_table_merge_hits_canonical_route():
    api = RecordingApiClient(default={"id": "merge-1"})
    ctx = ToolContext(
        tenant_id="my-rest",
        customer_id="cust-1",
        session_id="sess-1",
        api_client=api,
    )
    result = dispatch_tool("request_table_merge", {"targetTable": "5"}, ctx)
    assert result.error is None
    assert len(api.calls) == 1
    method, path, body = api.calls[0]
    assert method == "POST"
    assert path == "/my-rest/table-merge-requests"
    assert body["targetTableLabel"] == "5"
    assert body["originTableSessionId"] == "sess-1"
    assert body["requestingCustomerId"] == "cust-1"


def test_request_table_merge_handles_429_cooldown():
    """Cooldown response should produce a friendly message, not an error bubble."""
    from services.api_client import ApiClientError
    api = RecordingApiClient(
        raise_on_call=ApiClientError("cooldown", status_code=429),
    )
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("request_table_merge", {"targetTable": "5"}, ctx)
    assert result.error is None
    assert "tentada há pouco" in (result.message or "")
    assert result.action_payload.get("cooldown") is True


# ─────────────────────────────────────────────────────────────
# delete_chat → DELETE /:slug/chat-history/threads/:threadId
# ─────────────────────────────────────────────────────────────


def test_delete_chat_hits_canonical_route():
    api = RecordingApiClient(default=None)
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("delete_chat", {"threadId": "thread-xyz"}, ctx)
    assert result.error is None
    assert len(api.calls) == 1
    method, path, _ = api.calls[0]
    assert method == "DELETE"
    assert path == "/my-rest/chat-history/threads/thread-xyz?customerId=cust-1"


# ─────────────────────────────────────────────────────────────
# delete_all_chats → DELETE /:slug/chat-history?customerId=…
# ─────────────────────────────────────────────────────────────


def test_delete_all_chats_hits_canonical_route():
    api = RecordingApiClient(default={"deletedCount": 3})
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("delete_all_chats", {}, ctx)
    assert result.error is None
    assert len(api.calls) == 1
    method, path, _ = api.calls[0]
    assert method == "DELETE"
    assert path == "/my-rest/chat-history?customerId=cust-1"
    assert "3 conversa" in (result.message or "")


# ─────────────────────────────────────────────────────────────
# send_message_to_manager → in-process via AssistantService (round 22)
#
# Antes a tool hitava `POST /:slug/staff-messages` direto (P0 #6/7) sem
# auth de staff → 401 silencioso. A persistência foi movida pro
# AssistantService no apps/api, que tem tenantId/customerId/sessionId
# resolvidos e chama `CustomerStaffMessagesService.appendOutbound()`
# direto. A tool em si só monta o turno do chat (message + chips +
# action_payload) — NÃO bate em HTTP nenhum.
# ─────────────────────────────────────────────────────────────


def test_send_message_to_manager_does_not_call_api():
    """Round 22: tool não faz HTTP. Persistência é server-side no apps/api."""
    api = RecordingApiClient(default={"id": "msg-1"})
    ctx = ToolContext(
        tenant_id="my-rest",
        waiter_id="staff-9",
        api_client=api,
    )
    result = dispatch_tool(
        "send_message_to_manager",
        {"text": "preciso de mais guardanapos"},
        ctx,
    )
    assert result.error is None
    assert len(api.calls) == 0, (
        "send_message_to_manager não pode bater em HTTP — apps/api "
        "AssistantService faz appendOutbound in-process depois da dispatch."
    )
    assert "Mensagem enviada" in (result.message or "")
    # action_payload carrega o texto pra que tooling downstream (incluindo
    # o AssistantService que faz o persist) tenha acesso direto sem
    # reparsear arguments.
    assert result.action_payload["text"] == "preciso de mais guardanapos"
    assert result.action_payload["messageSent"] is True


def test_send_message_to_manager_works_without_api_client():
    """api_client None (P0 #7) — tool retorna mensagem mesmo assim."""
    ctx = ToolContext(tenant_id="my-rest", waiter_id="staff-9", api_client=None)
    result = dispatch_tool(
        "send_message_to_manager",
        {"text": "hi"},
        ctx,
    )
    assert result.error is None
    assert "Mensagem enviada" in (result.message or "")


# ─────────────────────────────────────────────────────────────
# view_courtesy — silent navigation, NO HTTP call
# ─────────────────────────────────────────────────────────────


def test_view_courtesy_does_not_call_api():
    """No `/courtesy` endpoint exists on apps/api — tool is FE-only fallback."""
    api = RecordingApiClient()
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("view_courtesy", {}, ctx)
    assert result.error is None
    assert len(api.calls) == 0, "view_courtesy must NOT issue an HTTP call (route 404)"
    assert result.action_payload.get("status") == "not_implemented"


# ─────────────────────────────────────────────────────────────
# api_client integration — wire correctness
# ─────────────────────────────────────────────────────────────


def test_recording_client_replays_queued_responses():
    api = RecordingApiClient(queued_responses=[{"a": 1}, {"b": 2}])
    assert api("GET", "/x", None) == {"a": 1}
    assert api("GET", "/y", None) == {"b": 2}
    assert api("GET", "/z", None) is None  # default
    assert api.calls == [
        ("GET", "/x", None),
        ("GET", "/y", None),
        ("GET", "/z", None),
    ]
