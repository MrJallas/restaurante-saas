"""
Send a free-text message to the manager (canonical name per F2 spec).

Renamed from `staff_message_send` — same semantics, new name to match the
canonical registry. The legacy `staff_message_send` module forwards here as
a deprecated alias.

Requires `text` arg (validated by dispatcher via STAFF_TOOLS_REQUIRING_TEXT).
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # `text` non-empty is enforced by the dispatcher (STAFF_TOOLS_REQUIRING_TEXT).
    text = args["text"].strip()
    target_session_id = args.get("sessionId")

    if ctx.api_client:
        try:
            # Path canonicalised against `apps/api/.../staff-messages.controller.ts`:
            # @Controller(':slug/staff-messages') · @Post(). Body matches
            # `SendMessageDto` (senderStaffId, body, optional recipientStaffId,
            # threadId, subject, isBroadcast). Was hitting `POST /staff/messages`
            # which 404's.
            ctx.api_client("POST", f"/{ctx.tenant_id}/staff-messages", {
                "senderStaffId": ctx.waiter_id,
                "body": text,
                # `target_session_id` is the customer session — backend may use
                # this for routing context (subject/thread mapping). Kept as
                # subject for now until the staff↔customer thread model lands.
                "subject": target_session_id,
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message="Mensagem enviada.",
        action_payload={"messageSent": True, "toSessionId": target_session_id},
    )
