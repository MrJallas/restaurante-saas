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
  - Specs em `.ai/prompts/sessoes/02-cross-simulator-validation.md` Subagentes B
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
from .accept_join_request import call as _accept_join_request
from .reject_join_request import call as _reject_join_request

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
    "accept_join_request": ToolMeta(
        name="accept_join_request", call=_accept_join_request,
        silent=False, requires_text=False, router=False, audience="customer",
    ),
    "reject_join_request": ToolMeta(
        name="reject_join_request", call=_reject_join_request,
        silent=False, requires_text=False, router=False, audience="customer",
    ),

    # ──────────────────────────────────────────────
    # Canonical · LGPD/history
    # ──────────────────────────────────────────────
    "delete_chat": ToolMeta(
        name="delete_chat", call=_delete_chat,
        silent=False, requires_text=False, router=False, audience="customer",
        # Irreversible ("Conversa apagada. Não tem volta.") → confirm gate.
        destructive=True,
    ),
    "delete_all_chats": ToolMeta(
        name="delete_all_chats", call=_delete_all_chats,
        silent=False, requires_text=False, router=False, audience="customer",
        # Mass irreversible delete of every thread ("Não tem volta") → confirm gate.
        destructive=True,
    ),
    "lgpd_data_request": ToolMeta(
        name="lgpd_data_request", call=_lgpd_data_request,
        # Silent handoff: never reports fulfillment. The FE owns the
        # authenticated POST and renders its real protocol response.
        silent=True, requires_text=False, router=False, audience="customer",
        # Formal erasure is irreversible. A model-originated call is always
        # downgraded to the canonical notice below; only an out-of-band browser
        # confirmation may reach this handoff, which itself never executes HTTP.
        destructive=True,
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
    "request_table_merge", "accept_join_request", "reject_join_request",
    # lgpd / history
    "delete_chat", "delete_all_chats", "view_chat_history", "lgpd_data_request",
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


# Tools that irreversibly destroy customer data. The dispatcher gates these
# behind an explicit `confirm=true` arg — see `dispatch_tool`. Derived from
# the `destructive` flag on each ToolMeta so the two never drift.
DESTRUCTIVE_TOOLS: set[str] = {
    name for name, meta in TOOLS.items() if meta.destructive
}


def _is_confirmed(args: dict[str, Any]) -> bool:
    """True when the customer explicitly approved a destructive action.

    Accepts `confirm` as a real bool `True`, or the strings the FE / LLM may
    serialise ("true"/"yes"/"1") — but nothing else. Absent/false → not
    confirmed, so the gate holds.
    """
    val = (args or {}).get("confirm")
    if val is True:
        return True
    if isinstance(val, str):
        return val.strip().lower() in {"true", "yes", "sim", "1"}
    return False


def _destructive_confirm_prompt(name: str, args: dict[str, Any]) -> ToolResult:
    """Ask for explicit confirmation instead of running a destructive tool.

    Mirrors the existing two-step consent pattern (show_lgpd_notice →
    lgpd_data_request): return a bubble + a binary chip pair, where the
    confirm chip carries the SAME tool with `confirm=true` (preserving the
    original args, e.g. threadId). web-customer consumes that object directly
    and executes the DELETE with its recognition_token cookie; the AI service
    never turns customerId context into HTTP authorization.
    """
    # Preserve the caller's args (e.g. delete_chat's threadId) and stamp
    # confirm=true so the re-emission actually runs.
    confirm_args = {k: v for k, v in (args or {}).items() if k != "confirm"}
    confirm_args["confirm"] = True

    if name == "delete_all_chats":
        message = (
            "Isso apaga TODAS as suas conversas de uma vez e não tem volta. "
            "Confirma que quer apagar tudo?"
        )
    else:
        message = "Isso apaga a conversa e não tem volta. Confirma?"

    return ToolResult(
        message=message,
        chips=[
            {
                "id": f"{name}-confirm",
                "label": "Sim, apagar",
                "action": "send",
                "payload": {"tool": name, "args": confirm_args},
                "primary": True,
            },
            {
                "id": f"{name}-cancel",
                "label": "Cancelar",
                "action": "send",
                "payload": {"tool": "dismiss", "args": {}},
                "primary": False,
            },
        ],
        action_payload={"messageType": "destructive_confirm", "tool": name},
    )


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


# The ONLY dispatch origin whose `confirm` is trusted. In the product path,
# web-customer consumes the chip itself and calls apps/api with the browser
# cookie. `/tools/dispatch` may still validate an out-of-band chip for other
# orchestrators, but delete_* only returns a browser-action payload; it never
# performs the authenticated DELETE. Any LLM origin still gets confirm stripped.
_TRUSTED_CONFIRM_ORIGIN = "chip"


def dispatch_tool(
    name: str,
    args: dict[str, Any],
    ctx: ToolContext,
    origin: str = "llm",
) -> ToolResult:
    """
    Validate args + invoke the tool. Returns the ToolResult unchanged.

    `origin` marks WHERE this dispatch came from and is the server-side
    invariant that closes the destructive-confirm gate on both sides:

      - "llm"  (default): the LLM tool-call loop. The model controls `args`,
        so `confirm` here is UNTRUSTED — it is stripped before the gate runs.
        A hallucinating/jailbroken model emitting {"confirm": true} therefore
        re-hits the gate and gets a confirmation chip instead of a delete.
      - "chip" (`_TRUSTED_CONFIRM_ORIGIN`): an out-of-band dispatch the human
        triggered by tapping the confirm chip. Only here is `confirm` honored;
        delete_* then delegates execution to the browser cookie boundary.

    The default is the SECURE one: any caller that forgets to pass `origin`
    cannot confirm a destructive action. `additionalProperties:False` in
    schemas.py is a prompt hint, not a server invariant — this is.

    Raises:
      - ToolNotFoundError: unknown tool
      - ToolValidationError: missing required text on a staff tool
    """
    meta = TOOLS.get(name)
    if meta is None:
        raise ToolNotFoundError(f"unknown tool: {name}")

    # Confused-deputy barrier: the LLM/tool name never grants a role. Customer
    # chat runs with is_staff=False, so a hallucinated or prompt-injected staff
    # tool is rejected before any HTTP side effect. Staff tools require a
    # cryptographically verified staff context supplied by a trusted caller;
    # booleans in model arguments are irrelevant.
    if meta.audience in {"staff", "manager"} and not ctx.is_staff:
        return ToolResult(
            error={
                "code": "staff_auth_required",
                "message": "Esta ação exige uma sessão autenticada da equipe.",
            }
        )
    if meta.audience == "manager" and not ctx.is_manager:
        return ToolResult(
            error={
                "code": "manager_auth_required",
                "message": "Esta ação exige uma sessão autenticada de gerente.",
            }
        )

    # A model can hallucinate this tool or be prompt-injected into emitting it.
    # Do not even return the generic destructive-confirm payload: route the
    # turn back to the canonical legal notice. The actual erasure lives solely
    # behind web-customer's authenticated, out-of-band confirmation button.
    if name == "lgpd_data_request" and origin != _TRUSTED_CONFIRM_ORIGIN:
        if not ctx.customer_id:
            return meta.call(args or {}, ctx)
        return _show_lgpd_notice({}, ctx)

    # Server-side invariant: strip any `confirm` the LLM may have forged. The
    # model's token-stream can NEVER confirm a destructive action — only the
    # out-of-band chip path is trusted. We copy so we don't mutate the caller's
    # dict (the tool-call audit record keeps the raw args the model emitted).
    if origin != _TRUSTED_CONFIRM_ORIGIN and args and "confirm" in args:
        args = {k: v for k, v in args.items() if k != "confirm"}

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

    # Confirmation gate for irreversible data-destruction tools. An LLM
    # hallucination or a malicious "apaga tudo" prompt must NOT wipe the
    # customer's chat history on the first emission. We only run the delete
    # once the customer has explicitly confirmed (`confirm=true`), which the
    # FE surfaces via the confirm chip returned below.
    #
    # We gate only when a customer is actually identified: an anonymous caller
    # has nothing to delete, so we let the tool run and return its own login
    # hint (keeps the existing anonymous UX + avoids a pointless prompt).
    if meta.destructive and ctx.customer_id and not _is_confirmed(args or {}):
        # Don't prompt to confirm deleting an unspecified target — let the
        # tool surface its own missing-arg error first (that path never
        # deletes, so the security invariant still holds). delete_chat needs
        # a threadId; without it, fall through to `meta.call` for the
        # `missing_thread_id` error.
        if name == "delete_chat" and not (
            (args or {}).get("threadId") or (args or {}).get("thread_id")
        ):
            return meta.call(args or {}, ctx)
        return _destructive_confirm_prompt(name, args or {})

    return meta.call(args or {}, ctx)


__all__ = [
    "TOOLS",
    "CANONICAL_TOOL_NAMES",
    "STAFF_TOOLS_REQUIRING_TEXT",
    "DESTRUCTIVE_TOOLS",
    "dispatch_tool",
    "ToolContext",
    "ToolResult",
    "ToolMeta",
    "ToolNotFoundError",
    "ToolValidationError",
]
