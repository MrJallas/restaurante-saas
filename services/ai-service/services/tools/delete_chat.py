"""
Delete the current chat thread (LGPD individual delete).

Per `chat-history-lgpd.md` — the customer can delete a single chat thread
via the chat history screen OR via this tool when they ask in conversation.
Hits `DELETE /customer/chats/:threadId`; the backend marks the thread as
`deletedByUser=true` and TTL removes within 60s.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    thread_id = args.get("threadId") or args.get("thread_id")
    if not thread_id:
        return ToolResult(error={
            "code": "missing_thread_id",
            "message": "qual conversa você quer apagar?",
        })

    if not ctx.customer_id:
        return ToolResult(
            message="Pra apagar uma conversa, preciso te identificar primeiro.",
            silent=True,
        )

    if ctx.api_client:
        try:
            ctx.api_client("DELETE", f"/customer/chats/{thread_id}", None)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Conversa apagada. Não tem volta.",
        action_payload={"deletedThreadId": thread_id},
    )
