"""
Tests for the 4 tool URL paths fixed under P0 #6.

Each test injects a `RecordingApiClient` into the ToolContext and asserts
the (method, path, body) tuple matches the canonical `apps/api` route. The
canonical routes were validated against the corresponding NestJS controllers:

  - request_table_merge → browser-session action payload
    (apps/api/src/modules/table-merge/table-merge.controller.ts is protected by SessionGuard)
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

`accept_join_request` / `reject_join_request` are also browser-session
actions. The protected `/table/participants/decide` endpoint is called by
web-customer, not by the AI service.
"""

import pytest

from services.tools import dispatch_tool, ToolContext
from services.api_client import ApiClientError, RecordingApiClient


# ─────────────────────────────────────────────────────────────
# request_table_merge → FE creates with browser session
# ─────────────────────────────────────────────────────────────


def test_request_table_merge_returns_frontend_payload_without_http():
    api = RecordingApiClient(default={"id": "merge-1"})
    ctx = ToolContext(
        tenant_id="my-rest",
        customer_id="cust-1",
        session_id="sess-1",
        api_client=api,
    )
    result = dispatch_tool("request_table_merge", {"targetTable": "5"}, ctx)
    assert result.error is None
    assert len(api.calls) == 0
    assert result.action_payload["targetTableLabel"] == "5"


def test_request_table_merge_without_target_opens_salon_picker():
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1")
    result = dispatch_tool("request_table_merge", {}, ctx)
    assert result.error is None
    assert result.action_payload.get("requiresTargetSelection") is True
    assert [chip["label"] for chip in result.chips] == [
        "Escolher mesa",
        "Chamar recepcionista",
        "Ver cardápio",
    ]


@pytest.mark.parametrize(
    "tool_name,decision",
    [
        ("accept_join_request", "approve"),
        ("reject_join_request", "reject"),
    ],
)
def test_join_request_decision_tools_do_not_call_api(tool_name: str, decision: str):
    api = RecordingApiClient(default={"status": "should-not-be-used"})
    ctx = ToolContext(
        tenant_id="my-rest",
        customer_id="host-1",
        session_id="sess-1",
        api_client=api,
    )
    result = dispatch_tool(
        tool_name,
        {"targetCustomerId": "12345678-1234-4234-8234-123456789012"},
        ctx,
    )
    assert result.error is None
    assert api.calls == []
    assert result.action_payload["action"] == "decide_join_request"
    assert result.action_payload["decision"] == decision


# ─────────────────────────────────────────────────────────────
# delete_chat → DELETE /:slug/chat-history/threads/:threadId
# ─────────────────────────────────────────────────────────────


def test_delete_chat_hits_canonical_route():
    api = RecordingApiClient(default=None)
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    # `delete_chat` is destructive → the dispatcher gates it behind an explicit
    # confirm (see test_tools_registry.py). Pass confirm=True so we exercise the
    # canonical-route contract this test is about.
    result = dispatch_tool(
        "delete_chat", {"threadId": "thread-xyz", "confirm": True}, ctx
    )
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
    # Destructive → gated behind confirm (see test_tools_registry.py). Pass
    # confirm=True to exercise the canonical-route contract under test here.
    result = dispatch_tool("delete_all_chats", {"confirm": True}, ctx)
    assert result.error is None
    assert len(api.calls) == 1
    method, path, _ = api.calls[0]
    assert method == "DELETE"
    assert path == "/my-rest/chat-history?customerId=cust-1"
    assert "3 conversa" in (result.message or "")


# ─────────────────────────────────────────────────────────────
# lgpd_data_request → POST /:slug/lgpd-requests
# ─────────────────────────────────────────────────────────────


def test_lgpd_data_request_hits_canonical_route():
    api = RecordingApiClient(default={"protocolNumber": "LGPD-2026-05-15-0001"})
    ctx = ToolContext(
        tenant_id="my-rest",
        customer_id="cust-1",
        api_client=api,
        raw_message="quero excluir meus dados",
    )
    result = dispatch_tool("lgpd_data_request", {"type": "erasure"}, ctx)
    assert result.error is None
    assert len(api.calls) == 1
    method, path, body = api.calls[0]
    assert method == "POST"
    assert path == "/my-rest/lgpd-requests"
    assert body["kind"] == "erasure"
    assert body["originalMessage"] == "quero excluir meus dados"
    assert result.action_payload["lgpdErasure"]["backendDispatched"] is True


def test_lgpd_data_request_keeps_confirmation_when_api_fails():
    api = RecordingApiClient(
        raise_on_call=ApiClientError("unauthorized", status_code=401),
    )
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("lgpd_data_request", {"type": "erasure"}, ctx)
    assert result.error is None
    assert result.action_payload["lgpdErasure"]["backendDispatched"] is False


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
# view_courtesy — browser-session action, NO HTTP call
# ─────────────────────────────────────────────────────────────


def test_view_courtesy_does_not_call_api():
    """Customer courtesy endpoint is session-protected; FE fetches it."""
    api = RecordingApiClient()
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool("view_courtesy", {}, ctx)
    assert result.error is None
    assert len(api.calls) == 0, "view_courtesy must NOT issue an HTTP call without browser session"
    assert result.action_payload.get("action") == "show_courtesies"
    assert "endpoint" not in (result.message or "").lower()


# ─────────────────────────────────────────────────────────────
# customer draft order tools — client-state only, NO HTTP cart calls
# ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tool_name,args",
    [
        ("add_to_order", {"itemId": "12345678-1234-4234-8234-123456789012", "quantity": 1}),
        ("view_order", {}),
        ("remove_from_cart", {"itemId": "12345678-1234-4234-8234-123456789012"}),
        ("change_order", {"itemId": "12345678-1234-4234-8234-123456789012", "quantity": 2}),
        ("cancel_order", {}),
        ("confirm_order", {}),
    ],
)
def test_customer_draft_order_tools_do_not_call_api(tool_name, args):
    """Draft cart lives in web-customer state; tools must not hit /customer/cart/*."""
    api = RecordingApiClient()
    ctx = ToolContext(tenant_id="my-rest", customer_id="cust-1", api_client=api)
    result = dispatch_tool(tool_name, args, ctx)
    assert result.error is None
    assert api.calls == []
    assert result.action_payload is not None


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
