"""
LGPD erasure handoff — never an authorization or execution boundary.

The model and the AI service cannot prove that a human approved an
irreversible erasure: `customer_id` is context, and the AI service does not
possess the browser's httpOnly recognition cookie. The only executable path
is the web customer's out-of-band confirmation button, which calls
`POST /:slug/lgpd-requests` directly and lets apps/api authenticate the cookie.

This tool therefore returns a browser-action payload only. It never calls the
backend, never mints a protocol and never claims that data was deleted.
"""

from typing import Any

from ..lgpd_messages import LGPD_REQUIRES_LOGIN
from .types import ToolContext, ToolResult


LGPD_BROWSER_CONFIRMATION_REQUIRED = (
    "Para proteger seus dados, a exclusão só pode ser concluída pelo botão de "
    "confirmação do aplicativo. Nenhum dado foi apagado ainda."
)


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if not ctx.customer_id:
        return ToolResult(message=LGPD_REQUIRES_LOGIN, silent=True)

    request_type = args.get("type") or "erasure"
    return ToolResult(
        message=LGPD_BROWSER_CONFIRMATION_REQUIRED,
        silent=True,
        action_payload={
            "action": "lgpd_request_in_browser",
            "requestType": request_type,
            "requiresRecognitionCookie": True,
            "requiresOutOfBandConfirmation": True,
            "status": "not_executed",
        },
    )
