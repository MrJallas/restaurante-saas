"""Tests for the tool registry: counts, metadata flags, dispatch validation."""

import pytest

from services.tools import (
    TOOLS,
    STAFF_TOOLS_REQUIRING_TEXT,
    dispatch_tool,
    ToolContext,
    ToolNotFoundError,
    ToolValidationError,
)


def test_registers_all_25_tools():
    assert len(TOOLS) == 25, f"expected 25 tools, got {len(TOOLS)}"


def test_split_customer_vs_staff():
    customer = [m for m in TOOLS.values() if m.audience == "customer"]
    staff = [m for m in TOOLS.values() if m.audience == "staff"]
    assert len(customer) == 15, f"expected 15 customer tools, got {len(customer)}"
    assert len(staff) == 10, f"expected 10 staff tools, got {len(staff)}"


def test_staff_tools_requiring_text_set():
    expected = {
        "staff_message_send",
        "staff_broadcast",
        "staff_pause_zone",
        "staff_respond_complaint",
    }
    assert STAFF_TOOLS_REQUIRING_TEXT == expected


def test_complaint_compose_is_router():
    assert TOOLS["complaint_compose"].router is True


def test_rate_order_is_router():
    assert TOOLS["rate_order"].router is True


def test_lgpd_erase_chat_silent():
    meta = TOOLS["lgpd_erase_chat"]
    assert meta.silent is True
    assert meta.requires_text is False
    assert meta.router is False


def test_table_merge_request_metadata():
    meta = TOOLS["table_merge_request"]
    assert meta.silent is False
    assert meta.requires_text is False
    assert meta.router is False


def test_dispatch_unknown_tool_raises():
    ctx = ToolContext(tenant_id="t1")
    with pytest.raises(ToolNotFoundError):
        dispatch_tool("nonexistent_tool", {}, ctx)


def test_dispatch_staff_message_without_text_fails():
    ctx = ToolContext(tenant_id="t1", is_staff=True)
    with pytest.raises(ToolValidationError) as exc_info:
        dispatch_tool("staff_message_send", {}, ctx)
    assert exc_info.value.status_code == 400
    assert exc_info.value.chip_label == "preciso de mais detalhes"


def test_dispatch_staff_message_with_text_succeeds():
    ctx = ToolContext(tenant_id="t1", is_staff=True, waiter_id="w1")
    result = dispatch_tool("staff_message_send", {"text": "olá"}, ctx)
    assert result.error is None


def test_dispatch_lgpd_anonymous_returns_login_hint():
    ctx = ToolContext(tenant_id="t1", customer_id=None)
    result = dispatch_tool("lgpd_erase_chat", {}, ctx)
    assert result.silent is True
    assert "login" in (result.message or "").lower() or "identificar" in (result.message or "").lower()


def test_recommend_renders_chips():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("recommend", {
        "items": [
            {"id": "i1", "name": "Hamburguer", "priceCents": 4500},
            {"id": "i2", "name": "Salada Caesar", "priceCents": 3500},
        ],
    }, ctx)
    assert len(result.chips) == 2
    assert result.message is not None


def test_table_merge_no_target_returns_error():
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("table_merge_request", {}, ctx)
    assert result.error is not None
    assert result.error["code"] == "missing_target"
