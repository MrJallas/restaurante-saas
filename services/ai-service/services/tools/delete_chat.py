"""
Request deletion of one chat thread (LGPD individual delete).

Per `chat-history-lgpd.md` — the customer can delete a single chat thread
via the chat history screen OR via this tool when they ask in conversation.
The destructive confirmation chip is consumed by web-customer, which calls
the canonical endpoint with the browser's httpOnly recognition_token cookie.
The AI service must never authorize that request with a body/query customerId.
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

    # Defense in depth: even for origin="chip", this process has no browser
    # recognition cookie and therefore does not execute the DELETE. The FE
    # already owns the confirmed action and renders the success/error bubble.
    return ToolResult(
        silent=True,
        action_payload={
            "action": "delete_chat_in_browser",
            "threadId": thread_id,
            "requiresRecognitionCookie": True,
        },
    )
