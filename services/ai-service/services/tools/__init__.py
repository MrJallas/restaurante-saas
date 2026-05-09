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

Naming convention (F2 round):
  - Canonical names (e.g. `recommend_dish`, `add_to_order`) are the names the
    LLM is told about in the system prompt. Earlier rounds also registered
    legacy names (`recommend`, `add_to_cart`, etc.) as deprecated forwarding
    aliases; those have since been removed (P1 #30) — every caller is on the
    canonical name.

Round 3 spec drift cheatsheet (P1 #B-3 / D-4):
  - Specs antigas referenciavam `modify_order_item` / `remove_order_item` /
    `request_bill`. Esses nomes NÃO existem no registry. Os canônicos são:
      · `change_order`     (era `modify_order_item`)
      · `remove_from_cart` (era `remove_order_item`)
      · `cancel_order`     (variante semântica · cancela pedido inteiro)
      · `request_check`    (era `request_bill`)
  - Specs em `docs/prompts/02-cross-simulator-validation.md` Subagentes B
    e D foram atualizadas com os nomes reais — não renomear no registry,
    pois o canônico está estável e atualizar a spec é mais barato.
"""

from typing import Any

from .types import ToolContext, ToolResult, ToolMeta

# ─────────────────────────────────────────────────────────────
# Canonical tools — order/menu
# ─────────────────────────────────────────────────────────────
from .view_menu import call as _view_menu
from .search_dish import call as _search_dish
from .check_allergens import call as _check_allergens
from .compare_dishes import call as _compare_dishes
from .recommend_dish import call as _recommend_dish
from .add_to_order import call as _add_to_order
from .view_order import call as _view_order
from .confirm_order import call as _confirm_order

# ─────────────────────────────────────────────────────────────
# Canonical tools — payment
# ─────────────────────────────────────────────────────────────
from .split_bill import call as _split_bill
from .pay_individual import call as _pay_individual
from .pay_full import call as _pay_full
from .open_payment_screen import call as _open_payment_screen

# ─────────────────────────────────────────────────────────────
# Canonical tools — staff/communication
# ─────────────────────────────────────────────────────────────
from .call_waiter import call as _call_waiter
from .send_message_to_manager import call as _send_message_to_manager
from .send_complaint import call as _send_complaint
from .request_table_merge import call as _request_table_merge

# ─────────────────────────────────────────────────────────────
# Canonical tools — LGPD/history
# ─────────────────────────────────────────────────────────────
from .delete_chat import call as _delete_chat
from .delete_all_chats import call as _delete_all_chats
from .lgpd_data_request import call as _lgpd_data_request
from .show_lgpd_notice import call as _show_lgpd_notice

# ─────────────────────────────────────────────────────────────
# Canonical tools — info
# ─────────────────────────────────────────────────────────────
from .view_courtesy import call as _view_courtesy
from .ask_about_restaurant import call as _ask_about_restaurant
from .rate_visit import call as _rate_visit

# ─────────────────────────────────────────────────────────────
# Legacy customer tools (NOT in F2 canonical list but still in use)
# ─────────────────────────────────────────────────────────────
from .request_check import call as _request_check
from .late_arrival_request import call as _late_arrival_request
from .change_order import call as _change_order
from .cancel_order import call as _cancel_order
from .remove_from_cart import call as _remove_from_cart
from .view_chat_history import call as _view_chat_history
from .explain_dish import call as _explain_dish

# ─────────────────────────────────────────────────────────────
# Staff-facing tools (9) — staff_message_send was a deprecated alias for
# send_message_to_manager and was removed in P1 #30.
# ─────────────────────────────────────────────────────────────
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
    # ──────────────────────────────────────────────
    # Canonical · order/menu
    # ──────────────────────────────────────────────
    "view_menu": ToolMeta(
        name="view_menu", call=_view_menu,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "search_dish": ToolMeta(
        name="search_dish", call=_search_dish,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "check_allergens": ToolMeta(
        name="check_allergens", call=_check_allergens,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "compare_dishes": ToolMeta(
        name="compare_dishes", call=_compare_dishes,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "recommend_dish": ToolMeta(
        name="recommend_dish", call=_recommend_dish,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "add_to_order": ToolMeta(
        name="add_to_order", call=_add_to_order,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "view_order": ToolMeta(
        name="view_order", call=_view_order,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "confirm_order": ToolMeta(
        name="confirm_order", call=_confirm_order,
        silent=False, requires_text=False, router=False, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Canonical · payment
    # ──────────────────────────────────────────────
    "split_bill": ToolMeta(
        name="split_bill", call=_split_bill,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "pay_individual": ToolMeta(
        name="pay_individual", call=_pay_individual,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "pay_full": ToolMeta(
        name="pay_full", call=_pay_full,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "open_payment_screen": ToolMeta(
        name="open_payment_screen", call=_open_payment_screen,
        silent=False, requires_text=False, router=True, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Canonical · staff/communication (customer-side)
    # ──────────────────────────────────────────────
    "call_waiter": ToolMeta(
        name="call_waiter", call=_call_waiter,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "send_message_to_manager": ToolMeta(
        name="send_message_to_manager", call=_send_message_to_manager,
        # Customer-side tool: customer asks the LLM to relay text to the
        # manager. Requires non-empty text — the dispatcher enforces it.
        # Was `staff_message_send` (audience="staff") originally, but the
        # canonical name + semantic flip per F2 spec puts it on the customer
        # side. Legacy `staff_message_send` alias still registered as audience="staff".
        silent=False, requires_text=True, router=False, audience="customer",
    ),
    "send_complaint": ToolMeta(
        name="send_complaint", call=_send_complaint,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    "request_table_merge": ToolMeta(
        name="request_table_merge", call=_request_table_merge,
        silent=False, requires_text=False, router=False, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Canonical · LGPD/history
    # ──────────────────────────────────────────────
    "delete_chat": ToolMeta(
        name="delete_chat", call=_delete_chat,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "delete_all_chats": ToolMeta(
        name="delete_all_chats", call=_delete_all_chats,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "lgpd_data_request": ToolMeta(
        name="lgpd_data_request", call=_lgpd_data_request,
        # silent dispatch — returns canonical confirmation as bubble text;
        # FE doesn't render a "tool was used" indicator.
        silent=True, requires_text=False, router=False, audience="customer",
    ),
    "show_lgpd_notice": ToolMeta(
        name="show_lgpd_notice", call=_show_lgpd_notice,
        # NOT silent — the LGPD notice is rendered as a normal bubble +
        # 2 consent chips; FE renders ToolCallIndicator like other tools.
        silent=False, requires_text=False, router=False, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Canonical · info
    # ──────────────────────────────────────────────
    "view_courtesy": ToolMeta(
        name="view_courtesy", call=_view_courtesy,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "ask_about_restaurant": ToolMeta(
        name="ask_about_restaurant", call=_ask_about_restaurant,
        # silent: the LLM follows up with the actual answer in the next turn.
        silent=True, requires_text=False, router=False, audience="customer",
    ),
    "rate_visit": ToolMeta(
        name="rate_visit", call=_rate_visit,
        silent=False, requires_text=False, router=True, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Legacy customer tools (still in use, not in canonical list)
    # ──────────────────────────────────────────────
    "request_check": ToolMeta(
        name="request_check", call=_request_check,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "late_arrival_request": ToolMeta(
        name="late_arrival_request", call=_late_arrival_request,
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
    "remove_from_cart": ToolMeta(
        name="remove_from_cart", call=_remove_from_cart,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "view_chat_history": ToolMeta(
        name="view_chat_history", call=_view_chat_history,
        silent=False, requires_text=False, router=True, audience="customer",
    ),
    # explain_dish — kept as a HELPER not exposed to the LLM. Spec doesn't
    # list it in the canonical set; it duplicates check_allergens for the
    # allergen subset and compare_dishes for the description subset. We keep
    # it registered for now because some legacy callers reference it directly,
    # but the LLM prompt should NOT advertise it. Decision flag below.
    "explain_dish": ToolMeta(
        name="explain_dish", call=_explain_dish,
        silent=False, requires_text=False, router=False, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Staff-facing tools (9)
    # Note: staff_message_send was a deprecated alias for
    # send_message_to_manager; removed in P1 #30.
    # ──────────────────────────────────────────────
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


# Canonical tool names per F2 spec — used by tests + system prompt builders
# to know which subset to advertise to the LLM. Aliases above forward to
# these but should NOT be advertised separately.
CANONICAL_TOOL_NAMES: set[str] = {
    # order/menu
    "view_menu", "search_dish", "check_allergens", "compare_dishes",
    "recommend_dish", "add_to_order", "view_order", "confirm_order",
    # payment
    "split_bill", "pay_individual", "pay_full", "open_payment_screen",
    # staff/communication
    "call_waiter", "send_message_to_manager", "send_complaint",
    "request_table_merge",
    # lgpd / history
    "delete_chat", "delete_all_chats", "lgpd_data_request",
    "show_lgpd_notice",
    # info
    "view_courtesy", "ask_about_restaurant", "rate_visit",
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
    "CANONICAL_TOOL_NAMES",
    "STAFF_TOOLS_REQUIRING_TEXT",
    "dispatch_tool",
    "ToolContext",
    "ToolResult",
    "ToolMeta",
    "ToolNotFoundError",
    "ToolValidationError",
]
