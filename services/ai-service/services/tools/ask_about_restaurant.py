"""
Generic restaurant info Q&A — hours, location, parking, kid-friendly, etc.

This tool is a thin wrapper that lets the LLM acknowledge it's looking up
restaurant-specific info. The actual answer is composed by the LLM from
the `tenant_context` already in the system prompt — we mainly use this
tool so FE can render a ToolCallIndicator while the LLM works.

TODO: when restaurant FAQ is wired (separate KB), this tool can do an actual
lookup; for now it's a passthrough.

Round 4 (C-NEW-3): retorna chips de follow-up canônicos pra que o FE não
caia no trio estático após uma pergunta operacional. Os 3 follow-ups mais
frequentes são endereço, estacionamento e wi-fi.
"""

from typing import Any
from .types import ToolContext, ToolResult


def _followup_chips() -> list[dict[str, Any]]:
    """Canonical follow-up chips após info operacional (round 4 §C-NEW-3)."""
    return [
        {"id": "info-endereco", "label": "Como chego aí", "action": "send", "payload": "qual o endereço?"},
        {"id": "info-estacionamento", "label": "Tem estacionamento", "action": "send", "payload": "tem estacionamento?"},
        {"id": "info-wifi", "label": "Vocês têm wifi", "action": "send", "payload": "tem wi-fi?"},
    ]


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    topic = (args.get("topic") or args.get("question") or "").strip()
    return ToolResult(
        message="Deixa eu ver o que sei sobre isso pra você.",
        silent=True,  # FE doesn't bubble — LLM follows up with the answer
        chips=_followup_chips(),
        action_payload={
            "status": "context_available",
            "tool": "ask_about_restaurant",
            "topic": topic or None,
        },
    )
