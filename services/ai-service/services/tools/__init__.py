"""
Tool registry for the AI assistant.

Each tool is a small module exposing a `call(args, ctx) -> ToolResult`. The
registry below pins NAME → metadata so the dispatcher can:

  - validate arguments before calling (e.g. STAFF_TOOLS_REQUIRING_TEXT)
  - emit FE-routing flags (`silent`, `requires_text`, `router`) on the
    ToolCall envelope (matches `packages/shared-types/src/ai.ts`)
  - log tool invocations for telemetry / auditing

Adding a tool:
  1. Create `services/tools/<tool_name>.py` with a `call(args, ctx)` function
     returning a `ToolResult`.
  2. Register it in `TOOLS` below with metadata flags.
  3. If staff-side and it needs free-text input, add to STAFF_TOOLS_REQUIRING_TEXT.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .types import ToolContext, ToolResult, ToolMeta

# Customer-facing tools (15)
from .add_to_cart import call as _add_to_cart
from .remove_from_cart import call as _remove_from_cart
from .confirm_order import call as _confirm_order
from .request_check import call as _request_check
from .call_waiter import call as _call_waiter
from .late_arrival_request import call as _late_arrival_request
from .table_merge_request import call as _table_merge_request
from .complaint_compose import call as _complaint_compose
from .rate_order import call as _rate_order
from .lgpd_erase_chat import call as _lgpd_erase_chat
from .view_chat_history import call as _view_chat_history
from .recommend import call as _recommend
from .explain_dish import call as _explain_dish
from .change_order import call as _change_order
from .cancel_order import call as _cancel_order

# Staff-facing tools (10)
from .staff_message_send import call as _staff_message_send
from .staff_broadcast import call as _staff_broadcast
from .staff_assign_call import call as _staff_assign_call
from .staff_resolve_call import call as _staff_resolve_call
from .staff_pause_zone import call as _staff_pause_zone
from .staff_unpause_zone import call as _staff_unpause_zone
from .staff_mark_vip import call as _staff_mark_vip
from .staff_unmark_vip import call as _staff_unmark_vip
from .staff_respond_complaint import call as _staff_respond_complaint
from .staff_resolve_complaint import call as _staff_resolve_complaint


# ─────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────

TOOLS: dict[str, ToolMeta] = {
    # Customer-facing (15)
    "add_to_cart": ToolMeta(
        name="add_to_cart", call=_add_to_cart,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "remove_from_cart": ToolMeta(
        name="remove_from_cart", call=_remove_from_cart,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "confirm_order": ToolMeta(
        name="confirm_order", call=_confirm_order,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "request_check": ToolMeta(
        name="request_check", call=_request_check,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "call_waiter": ToolMeta(
        name="call_waiter", call=_call_waiter,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "late_arrival_request": ToolMeta(
        name="late_arrival_request", call=_late_arrival_request,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "table_merge_request": ToolMeta(
        name="table_merge_request", call=_table_merge_request,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "complaint_compose": ToolMeta(
        name="complaint_compose", call=_complaint_compose,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "rate_order": ToolMeta(
        name="rate_order", call=_rate_order,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "lgpd_erase_chat": ToolMeta(
        name="lgpd_erase_chat", call=_lgpd_erase_chat,
        # silent dispatch but returns the canonical confirmation as the
        # bubble text — FE renders the message, just doesn't show a "tool
        # was used" indicator.
        silent=True, requires_text=False, router=False, audience="customer",
    ),
    "view_chat_history": ToolMeta(
        name="view_chat_history", call=_view_chat_history,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "recommend": ToolMeta(
        name="recommend", call=_recommend,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "explain_dish": ToolMeta(
        name="explain_dish", call=_explain_dish,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "change_order": ToolMeta(
        name="change_order", call=_change_order,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "cancel_order": ToolMeta(
        name="cancel_order", call=_cancel_order,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    # Staff-facing (10)
    "staff_message_send": ToolMeta(
        name="staff_message_send", call=_staff_message_send,
        silent=False, requires_text=True, router=False, audience="staff",
    ),
    "staff_broadcast": ToolMeta(
        name="staff_broadcast", call=_staff_broadcast,
        silent=False, requires_text=True, router=False, audience="staff",
    ),
    "staff_assign_call": ToolMeta(
        name="staff_assign_call", call=_staff_assign_call,
        silent=True, requires_text=False, router=False, audience="staff",
    ),
    "staff_resolve_call": ToolMeta(
        name="staff_resolve_call", call=_staff_resolve_call,
        silent=False, requires_text=False, router=False, audience="staff",
    ),
    "staff_pause_zone": ToolMeta(
        name="staff_pause_zone", call=_staff_pause_zone,
        silent=False, requires_text=True, router=False, audience="staff",
    ),
    "staff_unpause_zone": ToolMeta(
        name="staff_unpause_zone", call=_staff_unpause_zone,
        silent=False, requires_text=False, router=False, audience="staff",
    ),
    "staff_mark_vip": ToolMeta(
        name="staff_mark_vip", call=_staff_mark_vip,
        silent=False, requires_text=False, router=False, audience="staff",
    ),
    "staff_unmark_vip": ToolMeta(
        name="staff_unmark_vip", call=_staff_unmark_vip,
        silent=False, requires_text=False, router=False, audience="staff",
    ),
    "staff_respond_complaint": ToolMeta(
        name="staff_respond_complaint", call=_staff_respond_complaint,
        silent=False, requires_text=True, router=False, audience="staff",
    ),
    "staff_resolve_complaint": ToolMeta(
        name="staff_resolve_complaint", call=_staff_resolve_complaint,
        silent=False, requires_text=False, router=False, audience="staff",
    ),
}


# Set of staff tool names that require a non-empty `text` arg. Validated at
# dispatch time — see `dispatch_tool` below. Keep in sync with the `requires_text`
# flag in TOOLS for staff-audience entries.
STAFF_TOOLS_REQUIRING_TEXT: set[str] = {
    name for name, meta in TOOLS.items()
    if meta.audience == "staff" and meta.requires_text
}


# ─────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────

class ToolNotFoundError(Exception):
    """Raised when an unknown tool name is invoked."""


class ToolValidationError(Exception):
    """Raised when args fail validation (e.g. missing required text)."""

    def __init__(self, message: str, status_code: int = 400, chip_label: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.chip_label = chip_label


def dispatch_tool(name: str, args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """
    Validate args + invoke the tool. Returns the ToolResult unchanged.

    Raises:
      - ToolNotFoundError: unknown tool
      - ToolValidationError: missing required text on a staff tool
    """
    meta = TOOLS.get(name)
    if meta is None:
        raise ToolNotFoundError(f"unknown tool: {name}")

    # Staff tools that require a `text` payload are validated up-front. We
    # short-circuit here instead of letting each tool re-implement the check,
    # AND we surface the validation back to the LLM as a structured error
    # with a "preciso de mais detalhes" chip per the spec.
    if meta.requires_text:
        text = (args or {}).get("text")
        if not isinstance(text, str) or not text.strip():
            raise ToolValidationError(
                f"tool {name} requires non-empty 'text' arg",
                status_code=400,
                chip_label="preciso de mais detalhes",
            )

    return meta.call(args or {}, ctx)


__all__ = [
    "TOOLS",
    "STAFF_TOOLS_REQUIRING_TEXT",
    "dispatch_tool",
    "ToolContext",
    "ToolResult",
    "ToolMeta",
    "ToolNotFoundError",
    "ToolValidationError",
]
