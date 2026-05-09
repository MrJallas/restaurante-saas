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
    dispatch send_message_to_manager and assert the HTTP call shape.
    """
    from fastapi.testclient import TestClient

    api = RecordingApiClient(default={"id": "msg-1"})
    monkeypatch.setattr(main, "_api_client", api)
    client = TestClient(main.app)

    res = client.post(
        "/tools/dispatch",
        json={
            "name": "send_message_to_manager",
            "args": {"text": "olá gerência"},
            "tenantId": "tenant-x",
            "waiterId": "staff-1",
        },
    )
    assert res.status_code == 200, res.text
    # The api_client recorded the staff-messages POST.
    assert len(api.calls) == 1
    method, path, body = api.calls[0]
    assert method == "POST"
    assert path == "/tenant-x/staff-messages"
    assert body["body"] == "olá gerência"
