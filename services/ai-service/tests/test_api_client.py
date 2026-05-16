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
        assert fn("DELETE", "/restaurant_dev/chat-history?customerId=c1") == {"ok": True}

    client.request.assert_called_once()
    assert client.request.call_args.kwargs["url"] == "/chat-history?customerId=c1"


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
    dispatch `request_table_merge` (a tool that DOES use api_client) and
    assert the HTTP call shape.

    Round 22: switched from send_message_to_manager (which no longer uses
    api_client — persist é server-side no apps/api AssistantService) pra
    request_table_merge, que continua sendo HTTP-dispatched no AI side.
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
    assert len(api.calls) == 1
    method, path, body = api.calls[0]
    assert method == "POST"
    assert path == "/tenant-x/table-merge-requests"
    assert body["targetTableLabel"] == "5"
    assert body["originTableSessionId"] == "sess-1"
