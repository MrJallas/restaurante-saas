"""
Tests for `services.api_client` and the `_api_client` wiring in main (P0 #7).
"""

from unittest.mock import MagicMock, patch

import pytest

import main
from services.api_client import (
    ApiClientError,
    RecordingApiClient,
    make_http_api_client,
)


def test_recording_client_records_each_call():
    api = RecordingApiClient()
    api("POST", "/x", {"a": 1})
    api("DELETE", "/y", None)
    assert api.calls == [
        ("POST", "/x", {"a": 1}),
        ("DELETE", "/y", None),
    ]


def test_recording_client_raises_on_demand():
    api = RecordingApiClient(raise_on_call=ApiClientError("boom", status_code=500))
    with pytest.raises(ApiClientError) as e:
        api("GET", "/x", None)
    assert e.value.status_code == 500


def test_make_http_api_client_returns_callable():
    """We don't actually issue a network request — just confirm the factory wires."""
    fn = make_http_api_client("http://localhost:9999")
    assert callable(fn)


def test_make_http_api_client_strips_duplicate_tenant_prefix():
    """Docker may pass API_BASE_URL ending in /api/<tenant>; paths stay canonical."""
    response = MagicMock()
    response.status_code = 200
    response.content = b'{"ok": true}'
    response.json.return_value = {"ok": True}
    client = MagicMock()
    client.request.return_value = response

    with patch("httpx.Client", return_value=client):
        fn = make_http_api_client("http://api:3001/api/restaurant_dev")
        assert fn("GET", "/restaurant_dev/menu/search?q=risoto") == {"ok": True}

    client.request.assert_called_once()
    assert client.request.call_args.kwargs["url"] == "/menu/search?q=risoto"


def test_make_http_api_client_forwards_session_header():
    response = MagicMock()
    response.status_code = 200
    response.content = b'{"ok": true}'
    response.json.return_value = {"ok": True}
    client = MagicMock()
    client.request.return_value = response

    with patch("httpx.Client", return_value=client):
        fn = make_http_api_client("http://api:3001/api")
        assert fn("GET", "/restaurant_dev/menu/search?q=risoto", headers={"x-session-token": "sess-1"}) == {"ok": True}

    assert client.request.call_args.kwargs["headers"] == {"x-session-token": "sess-1"}


def test_context_api_client_prefixes_tenant_and_session_header(monkeypatch):
    api = RecordingApiClient(default={"ok": True})
    monkeypatch.setattr(main, "_api_client", api)

    scoped = main._context_api_client("restaurant_dev", "sess-1")
    assert scoped is not None
    assert scoped("GET", "/menu/search?q=risoto", None) == {"ok": True}

    assert api.calls == [("GET", "/restaurant_dev/menu/search?q=risoto", None)]
    assert api.call_headers == [{"x-session-token": "sess-1"}]


def test_context_api_client_forwards_staff_headers(monkeypatch):
    api = RecordingApiClient(default={"ok": True})
    monkeypatch.setattr(main, "_api_client", api)
    monkeypatch.setattr(main.settings, "STAFF_API_KEY", "staff-secret")

    scoped = main._context_api_client("restaurant_dev", "sess-1", "staff-1")
    assert scoped is not None
    assert scoped("POST", "/staff-messages", {"body": "Aviso"}) == {"ok": True}

    assert api.calls == [("POST", "/restaurant_dev/staff-messages", {"body": "Aviso"})]
    assert api.call_headers == [
        {
            "x-session-token": "sess-1",
            "x-staff-id": "staff-1",
            "x-staff-key": "staff-secret",
        }
    ]


def test_main_builds_api_client_when_base_url_set(monkeypatch):
    """`_build_api_client()` returns a callable when API_BASE_URL is configured."""
    monkeypatch.setattr(main.settings, "API_BASE_URL", "http://localhost:3000")
    client = main._build_api_client()
    assert client is not None
    assert callable(client)


def test_main_returns_none_when_base_url_empty(monkeypatch):
    """Empty API_BASE_URL → tools see api_client=None (graceful offline)."""
    monkeypatch.setattr(main.settings, "API_BASE_URL", "")
    assert main._build_api_client() is None


def test_tools_dispatch_endpoint_injects_api_client(monkeypatch):
    """
    P0 #7 acceptance: the `/tools/dispatch` endpoint wires api_client into
    ToolContext. We use a recording client + patch the singleton, then
    dispatch `request_table_merge` and assert it no longer calls apps/api
    directly. The table-merge create endpoint is protected by the browser
    SessionGuard, so the customer frontend performs the POST.
    """
    from fastapi.testclient import TestClient

    api = RecordingApiClient(default={"id": "merge-1"})
    monkeypatch.setattr(main, "_api_client", api)
    client = TestClient(main.app)

    res = client.post(
        "/tools/dispatch",
        json={
            "name": "request_table_merge",
            "args": {"targetTable": "5"},
            "tenantId": "tenant-x",
            "customerId": "cust-1",
            "sessionId": "sess-1",
        },
    )
    assert res.status_code == 200, res.text
    assert len(api.calls) == 0
    body = res.json()
    assert body["result"]["actionPayload"]["targetTableLabel"] == "5"


def test_tools_dispatch_rejects_body_claimed_staff_authority(monkeypatch):
    """The service key does not turn isManager/staffId body fields into a role."""
    from fastapi.testclient import TestClient

    api = RecordingApiClient(default={"ok": True})
    monkeypatch.setattr(main, "_api_client", api)
    client = TestClient(main.app)

    res = client.post(
        "/tools/dispatch",
        json={
            "name": "staff_broadcast",
            "args": {"text": "fechar o restaurante", "audience": "all"},
            "tenantId": "tenant-x",
            "staffId": "claimed-manager",
            "isStaff": True,
            "isManager": True,
        },
    )

    assert res.status_code == 403
    assert api.calls == []


def test_chat_delegation_uses_bearer_token_not_session_resource_id(monkeypatch):
    """A07 regression: table_sessions.id is context, never x-session-token."""
    from fastapi.testclient import TestClient

    api = RecordingApiClient(default={"id": "call-1"})
    monkeypatch.setattr(main, "_api_client", api)
    client = TestClient(main.app)

    res = client.post(
        "/chat",
        json={
            "message": "chame o garçom",
            "tenantId": "tenant-x",
            "customerId": "cust-1",
            "sessionId": "table-session-resource-id",
            "sessionToken": "hmac-bearer-token",
        },
    )

    assert res.status_code == 200, res.text
    assert api.calls == [
        (
            "POST",
            "/tenant-x/waiter-calls",
            {
                "sessionId": "table-session-resource-id",
                "reason": "geral",
                "isVip": False,
            },
        )
    ]
    assert api.call_headers == [{"x-session-token": "hmac-bearer-token"}]
