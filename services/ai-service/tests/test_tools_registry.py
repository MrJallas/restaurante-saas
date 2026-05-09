"""
Tests for the F2 tool registry: canonical set, dispatch validation,
LGPD notice payload shape, ack-pool rotation.
"""

import pytest

from services.tools import (
    TOOLS,
    CANONICAL_TOOL_NAMES,
    STAFF_TOOLS_REQUIRING_TEXT,
    dispatch_tool,
    ToolContext,
    ToolNotFoundError,
    ToolValidationError,
)


# ─────────────────────────────────────────────────────────────
# Canonical tool set per F2 spec
# ─────────────────────────────────────────────────────────────

EXPECTED_CANONICAL = {
    # order/menu (8)
    "view_menu", "search_dish", "check_allergens", "compare_dishes",
    "recommend_dish", "add_to_order", "view_order", "confirm_order",
    # payment (4)
    "split_bill", "pay_individual", "pay_full", "open_payment_screen",
    # staff/communication (4)
    "call_waiter", "send_message_to_manager", "send_complaint",
    "request_table_merge",
    # lgpd / history (4)
    "delete_chat", "delete_all_chats", "lgpd_data_request",
    "show_lgpd_notice",
    # info (3)
    "view_courtesy", "ask_about_restaurant", "rate_visit",
}


def test_canonical_set_matches_expected():
    """The CANONICAL_TOOL_NAMES export must match the F2 spec exactly."""
    assert CANONICAL_TOOL_NAMES == EXPECTED_CANONICAL, (
        f"\nMissing: {EXPECTED_CANONICAL - CANONICAL_TOOL_NAMES}\n"
        f"Extra:   {CANONICAL_TOOL_NAMES - EXPECTED_CANONICAL}"
    )


@pytest.mark.parametrize("tool_name", sorted(EXPECTED_CANONICAL))
def test_canonical_tool_is_registered(tool_name: str):
    """Every canonical tool name must be in the TOOLS registry."""
    assert tool_name in TOOLS, f"missing canonical tool: {tool_name}"
    meta = TOOLS[tool_name]
    assert meta.name == tool_name
    assert callable(meta.call)


def test_canonical_count_is_23():
    """F2 spec calls for ~25 tools (incl. optional session). Currently 23
    canonical tools without start/end_session (those are NOT in the codebase
    yet · spec says 'if exists, keep'). When session tools are added, this
    count bumps to 25."""
    assert len(CANONICAL_TOOL_NAMES) == 23


# ─────────────────────────────────────────────────────────────
# Removed-alias guardrail — old names must NOT be registered
# (cleaned up in P1 #30 after every caller moved to the canonical name).
# ─────────────────────────────────────────────────────────────

REMOVED_ALIASES = {
    "add_to_cart",
    "recommend",
    "complaint_compose",
    "lgpd_erase_chat",
    "table_merge_request",
    "rate_order",
    "staff_message_send",
}


@pytest.mark.parametrize("alias", sorted(REMOVED_ALIASES))
def test_removed_alias_no_longer_registered(alias: str):
    """Deprecated aliases were removed in P1 #30 — registry must not expose them."""
    assert alias not in TOOLS, f"removed alias {alias} resurfaced in TOOLS"


def test_removed_aliases_raise_tool_not_found():
    """Dispatching a removed alias must surface ToolNotFoundError, not silently route."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    for alias in REMOVED_ALIASES:
        with pytest.raises(ToolNotFoundError):
            dispatch_tool(alias, {}, ctx)


# ─────────────────────────────────────────────────────────────
# show_lgpd_notice — spec-compliant payload
# ─────────────────────────────────────────────────────────────

def test_show_lgpd_notice_returns_text_and_chips():
    """show_lgpd_notice() must return a dict-like ToolResult with text + chips."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("show_lgpd_notice", {}, ctx)

    # Spec mandates the canonical text + 2 binary consent chips.
    assert result.message, "show_lgpd_notice must return canonical text"
    assert len(result.chips) == 2, "show_lgpd_notice must return 2 chips"

    chip_actions = [c.get("payload", {}).get("tool") if isinstance(c.get("payload"), dict) else c.get("action") for c in result.chips]
    # First chip routes to lgpd_data_request, second is a dismiss.
    assert "lgpd_data_request" in str(chip_actions[0]) or chip_actions[0] == "lgpd_data_request"
    assert "dismiss" in str(chip_actions[1]).lower()


def test_show_lgpd_notice_text_matches_canonical():
    """The text returned must be byte-equal to LGPD_NOTICE."""
    from services.lgpd_messages import LGPD_NOTICE
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("show_lgpd_notice", {}, ctx)
    assert result.message == LGPD_NOTICE


def test_show_lgpd_notice_chip_labels_canonical():
    """Chip labels feed audit logs — must be canonical."""
    from services.lgpd_messages import LGPD_CHIP_CONFIRM, LGPD_CHIP_DISMISS
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("show_lgpd_notice", {}, ctx)
    labels = [c["label"] for c in result.chips]
    assert LGPD_CHIP_CONFIRM in labels
    assert LGPD_CHIP_DISMISS in labels


# ─────────────────────────────────────────────────────────────
# ACK pool rotation
# ─────────────────────────────────────────────────────────────

def test_get_ack_reply_returns_string():
    """get_ack_reply() must always return a non-empty string."""
    from services.classify_ack import get_ack_reply
    reply = get_ack_reply()
    assert isinstance(reply, str)
    assert len(reply) > 0


def test_get_ack_reply_rotates():
    """
    Calling get_ack_reply() N+1 times where N == pool size should cycle
    back to the first value (LPOP + RPUSH rotation).
    """
    from services.classify_ack import (
        get_ack_reply,
        seed_ack_replies,
        ACK_REPLIES,
        ACK_REPLIES_KEY,
    )
    from services.redis_pool import get_client

    # Reset the pool to a deterministic state for the test.
    client = get_client()
    client.delete(ACK_REPLIES_KEY)
    seed_ack_replies()

    pool_size = len(ACK_REPLIES)
    first_n_replies = [get_ack_reply() for _ in range(pool_size)]

    # All replies should be unique within one full rotation (covers the pool).
    assert len(set(first_n_replies)) == pool_size, (
        f"expected {pool_size} unique replies in one rotation, got "
        f"{len(set(first_n_replies))}: {first_n_replies}"
    )

    # The (N+1)-th reply should equal the first one (full cycle).
    next_reply = get_ack_reply()
    assert next_reply == first_n_replies[0], (
        f"expected rotation to cycle back to {first_n_replies[0]!r}, "
        f"got {next_reply!r}"
    )


def test_get_ack_reply_handles_empty_pool():
    """When the pool is wiped, get_ack_reply() must re-seed and return a value."""
    from services.classify_ack import get_ack_reply, ACK_REPLIES_KEY
    from services.redis_pool import get_client

    client = get_client()
    client.delete(ACK_REPLIES_KEY)

    reply = get_ack_reply()
    assert isinstance(reply, str)
    assert len(reply) > 0


# ─────────────────────────────────────────────────────────────
# Dispatcher validation (kept from original suite)
# ─────────────────────────────────────────────────────────────

def test_dispatch_unknown_tool_raises():
    ctx = ToolContext(tenant_id="t1")
    with pytest.raises(ToolNotFoundError):
        dispatch_tool("nonexistent_tool", {}, ctx)


def test_dispatch_send_message_without_text_fails():
    """Canonical send_message_to_manager requires text."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    with pytest.raises(ToolValidationError) as exc_info:
        dispatch_tool("send_message_to_manager", {}, ctx)
    assert exc_info.value.status_code == 400
    assert exc_info.value.chip_label == "preciso de mais detalhes"


def test_dispatch_send_message_with_text_succeeds():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("send_message_to_manager", {"text": "olá gerência"}, ctx)
    assert result.error is None


def test_dispatch_lgpd_data_request_anonymous_returns_login_hint():
    """Anonymous customer asking for LGPD erasure gets a guidance message."""
    ctx = ToolContext(tenant_id="t1", customer_id=None)
    result = dispatch_tool("lgpd_data_request", {}, ctx)
    assert result.silent is True
    assert "login" in (result.message or "").lower() or "identificar" in (result.message or "").lower()


def test_recommend_dish_renders_chips():
    """Canonical recommend_dish (renamed from recommend) returns chips."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("recommend_dish", {
        "items": [
            {"id": "i1", "name": "Hamburguer", "priceCents": 4500},
            {"id": "i2", "name": "Salada Caesar", "priceCents": 3500},
        ],
    }, ctx)
    assert len(result.chips) == 2
    assert result.message is not None


def test_request_table_merge_no_target_returns_error():
    """Canonical request_table_merge needs a targetTable."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("request_table_merge", {}, ctx)
    assert result.error is not None
    assert result.error["code"] == "missing_target"


# ─────────────────────────────────────────────────────────────
# New tool stubs — at least dispatch without raising
# ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("tool_name", sorted([
    "view_menu", "view_order", "split_bill", "pay_individual", "pay_full",
    "open_payment_screen", "view_courtesy", "ask_about_restaurant",
    "rate_visit",
]))
def test_new_tool_dispatches_without_error(tool_name: str):
    """Stub tools should at least return a ToolResult (router or message)."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool(tool_name, {}, ctx)
    assert result is not None


def test_check_allergens_requires_items():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("check_allergens", {}, ctx)
    assert result.error is not None
    assert result.error["code"] == "missing_items"


def test_compare_dishes_requires_two_items():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("compare_dishes", {"itemIds": ["only-one"]}, ctx)
    assert result.error is not None
    assert result.error["code"] == "need_two_items"


def test_search_dish_requires_query():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("search_dish", {}, ctx)
    assert result.error is not None
    assert result.error["code"] == "missing_query"


def test_delete_chat_requires_thread_id():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("delete_chat", {}, ctx)
    assert result.error is not None
    assert result.error["code"] == "missing_thread_id"


def test_delete_all_chats_anonymous_returns_login_hint():
    ctx = ToolContext(tenant_id="t1", customer_id=None)
    result = dispatch_tool("delete_all_chats", {}, ctx)
    # Anonymous → silent guidance message, no error.
    assert result.silent is True
    assert "identificar" in (result.message or "").lower()
