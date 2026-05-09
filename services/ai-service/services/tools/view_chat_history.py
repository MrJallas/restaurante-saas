"""Router → ScreenCustomerChatHistory."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # Round 4 §C-NEW-3 — chips típicos pré-listar histórico (LGPD context).
    return ToolResult(
        message="Abre o seu histórico de conversas — fica aqui por 30 dias.",
        router_target="ScreenCustomerChatHistory",
        chips=[
            {"id": "delete_all", "label": "Apagar todas", "action": "send", "payload": "apagar todas as minhas conversas"},
            {"id": "lgpd_request", "label": "Pedido LGPD", "action": "send", "payload": "quero fazer um pedido LGPD"},
            {"id": "back_to_chat", "label": "Voltar ao chat", "action": "navigate", "payload": "assistente"},
        ],
        action_payload={"customerId": ctx.customer_id},
    )
