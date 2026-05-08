"""Router → ScreenCustomerChatHistory."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    return ToolResult(
        message="Abre o seu histórico de conversas — fica aqui por 30 dias.",
        router_target="ScreenCustomerChatHistory",
        action_payload={"customerId": ctx.customer_id},
    )
