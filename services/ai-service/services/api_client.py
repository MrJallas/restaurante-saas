"""
HTTP client used by tools to talk back to `apps/api`.

Tools sit downstream of the LLM tool-call dispatcher; when the model emits
a tool_call we look up the handler, build a `ToolContext` whose `api_client`
is one of these callables, and the handler issues backend HTTP calls.

Design notes:
  - The callable signature is `(method, path, body) -> dict | None` so tools
    don't need to know about the underlying HTTP library.
  - We use `httpx.Client` (sync) intentionally — the dispatcher runs tool
    handlers synchronously (see `services/tools/__init__.py::dispatch_tool`).
    Switching to async would require migrating every tool's `call(args, ctx)`
    signature, which is out of scope for this round.
  - Errors are wrapped in `ApiClientError` with a `.status_code` attribute so
    tools can pattern-match on cooldown/conflict statuses (e.g. 429 in
    `request_table_merge`).
  - When `api_base_url` is empty (typical in tests) we return a noop client
    that records calls but doesn't actually fetch — keeps unit tests fast
    and offline-safe.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class ApiClientError(Exception):
    """HTTP failure surfaced from the apps/api backend."""

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def make_http_api_client(base_url: str, timeout: float = 10.0) -> Callable[..., Any]:
    """
    Build a callable that hits `apps/api` over HTTP.

    Returns a function with signature
    `(method, path, body, headers=None) -> dict | None`.
    Lazy-imports httpx at call time so the FastAPI app can boot even if
    httpx is missing (tests use the recording client below).
    """
    import httpx

    clean_base_url = base_url.rstrip("/")
    parsed_base = urlparse(clean_base_url)
    base_parts = [part for part in parsed_base.path.split("/") if part]
    base_tenant = (
        base_parts[-1]
        if len(base_parts) >= 2 and base_parts[-2] == "api"
        else None
    )
    client = httpx.Client(base_url=clean_base_url, timeout=timeout)

    def _call(
        method: str,
        path: str,
        body: Any = None,
        *,
        headers: dict[str, str] | None = None,
    ) -> Any:
        normalised = path if path.startswith("/") else f"/{path}"
        if base_tenant and normalised == f"/{base_tenant}":
            normalised = "/"
        elif base_tenant and normalised.startswith(f"/{base_tenant}/"):
            normalised = normalised[len(f"/{base_tenant}"):]
        try:
            res = client.request(
                method=method.upper(),
                url=normalised,
                json=body if body is not None else None,
                headers=headers or None,
            )
        except httpx.HTTPError as e:
            logger.warning("api_client transport error: %s %s — %s", method, normalised, e)
            raise ApiClientError(f"transport: {e}", status_code=None) from e

        if res.status_code >= 400:
            try:
                body_json = res.json()
            except ValueError:
                body_json = res.text
            logger.warning(
                "api_client non-2xx: %s %s → %s",
                method,
                normalised,
                res.status_code,
            )
            raise ApiClientError(
                f"{method} {normalised} → {res.status_code}",
                status_code=res.status_code,
                body=body_json,
            )

        if res.status_code == 204 or not res.content:
            return None
        try:
            return res.json()
        except ValueError:
            return res.text

    return _call


@dataclass
class RecordingApiClient:
    """
    Test double that records every (method, path, body) tuple and returns
    a queued response (or `default`). Used by unit tests instead of a real
    httpx call.

    Example:
        client = RecordingApiClient(default={"ok": True})
        ctx = ToolContext(tenant_id="t1", api_client=client)
        # ... dispatch a tool that does ctx.api_client("POST", "/x", {})
        assert client.calls[0] == ("POST", "/x", {})
    """

    default: Any = None
    calls: list[tuple[str, str, Any]] = field(default_factory=list)
    queued_responses: list[Any] = field(default_factory=list)
    raise_on_call: Optional[Exception] = None
    call_headers: list[dict[str, str] | None] = field(default_factory=list)

    def __call__(
        self,
        method: str,
        path: str,
        body: Any = None,
        *,
        headers: dict[str, str] | None = None,
    ) -> Any:
        self.calls.append((method, path, body))
        self.call_headers.append(headers)
        if self.raise_on_call is not None:
            raise self.raise_on_call
        if self.queued_responses:
            return self.queued_responses.pop(0)
        return self.default
