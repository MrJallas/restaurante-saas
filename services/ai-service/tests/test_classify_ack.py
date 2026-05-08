"""Tests for the 4th classification layer (`detect_ack`)."""

import pytest

from services.classify_ack import detect_ack, AckResult


@pytest.mark.parametrize("text", [
    "ok", "okay", "Ok!", "OK.",
    "valeu", "vlw", "obrigado", "obrigada",
    "show", "top", "blz", "beleza",
    "perfeito", "ótimo", "uhum", "claro",
    "👍", "👌",
    "tá bom", "ok então", "muito obrigada",
])
def test_detects_acks(text: str):
    result = detect_ack(text)
    assert isinstance(result, AckResult), f"expected ack for {text!r}"
    assert result.kind == "ack"
    assert result.confidence > 0.8


@pytest.mark.parametrize("text", [
    "quero pedir um hambúrguer",
    "qual o prato do dia?",
    "obrigado pelo atendimento mas queria reclamar",  # too long for ack
    "👍 chama o garçom",  # mixed emoji+text → not ack-only
    "",
    "   ",
])
def test_skips_non_acks(text: str):
    assert detect_ack(text) is None


def test_emoji_only_detected():
    res = detect_ack("👌")
    assert res is not None
    assert res.matched in {"emoji-only", "👌"}


def test_returns_none_for_empty():
    assert detect_ack("") is None
    assert detect_ack(None or "") is None
