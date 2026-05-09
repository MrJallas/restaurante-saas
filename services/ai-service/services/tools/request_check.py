"""Customer asks for the bill (`pediu_a_conta`)."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    if ctx.api_client:
        try:
            ctx.api_client("POST", "/customer/check-requests", {
                "sessionId": ctx.session_id,
                "splitMode": args.get("splitMode", "single"),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Pedi a conta pro garçom — já já chega na sua mesa.",
        chips=[
            {"id": "pay_pix", "label": "Pagar com PIX", "action": "send", "payload": "quero pagar com pix"},
            {"id": "pay_card", "label": "Pagar com cartão", "action": "send", "payload": "quero pagar com cartão"},
            {"id": "split", "label": "Dividir conta", "action": "send", "payload": "quero dividir a conta"},
        ],
        action_payload={"checkRequested": True},
    )
