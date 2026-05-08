"""
Generic restaurant info Q&A — hours, location, parking, kid-friendly, etc.

This tool is a thin wrapper that lets the LLM acknowledge it's looking up
restaurant-specific info. The actual answer is composed by the LLM from
the `tenant_context` already in the system prompt — we mainly use this
tool so FE can render a ToolCallIndicator while the LLM works.

TODO: when restaurant FAQ is wired (separate KB), this tool can do an actual
lookup; for now it's a passthrough.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    topic = (args.get("topic") or args.get("question") or "").strip()
    return ToolResult(
        message="Deixa eu ver o que sei sobre isso pra você.",
        silent=True,  # FE doesn't bubble — LLM follows up with the answer
        action_payload={
            "status": "not_implemented",
            "tool": "ask_about_restaurant",
            "topic": topic or None,
        },
    )
