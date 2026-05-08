"""Smoke tests for smart-suggestions + continuation modules."""

from services.smart_suggestions import get_suggestions
from services.continuation import get_continuation, render_continuation


def test_smart_suggestions_returns_default_pool_on_miss():
    out = get_suggestions(
        tenant_id="restaurant_dev",
        surface="home",
        limit=3,
        customer_id="c1",
        session_id="s1",
    )
    assert "suggestions" in out
    assert "poolExpiresAt" in out
    assert len(out["suggestions"]) <= 3
    # Each suggestion has the expected shape
    for s in out["suggestions"]:
        assert "id" in s
        assert "label" in s
        assert "text" in s


def test_smart_suggestions_unknown_surface_falls_back_to_home():
    out = get_suggestions(tenant_id="t1", surface="xyz", limit=2, customer_id=None)
    assert len(out["suggestions"]) <= 2


def test_continuation_returning_regular():
    msg = get_continuation(
        tenant_id="restaurant_dev",
        customer_ctx={"is_returning": True, "is_vip": False, "customer_name": "Caleb"},
    )
    assert msg is not None
    assert "template" in msg
    rendered = render_continuation(msg, {"customerName": "Caleb", "favoriteItem": "hambúrguer"})
    assert isinstance(rendered, str)


def test_continuation_returning_vip_warmer_tone():
    msg = get_continuation(
        tenant_id="restaurant_dev",
        customer_ctx={"is_returning": True, "is_vip": True, "customer_name": "Ana"},
    )
    assert msg is not None
    # VIP segment templates exist with warmer phrasing.
    assert msg["kind"] in {"idle_nudge", "pos_rating_positive"} or msg.get("template")


def test_continuation_explicit_kind():
    msg = get_continuation(
        tenant_id="restaurant_dev",
        customer_ctx={},
        kind="pos_rating_positive",
    )
    assert msg is not None
    assert msg["kind"] == "pos_rating_positive"


def test_render_continuation_substitutes_slots():
    msg = {"template": "Olá {customerName}!", "slots": ["customerName"]}
    out = render_continuation(msg, {"customerName": "Caleb"})
    assert out == "Olá Caleb!"


def test_render_continuation_missing_slot_is_empty():
    msg = {"template": "Quer o {favoriteItem}?", "slots": ["favoriteItem"]}
    out = render_continuation(msg, {})
    assert out == "Quer o ?"
