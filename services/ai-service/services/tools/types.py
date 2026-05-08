"""
Tool dispatcher type contracts.

Mirrors `packages/shared-types/src/ai.ts::ToolCall` on the wire:
  - `silent`    → don't render a ToolCallIndicator
  - `requires_text` → LLM follows up with a text bubble after the tool result
  - `router`    → tool is a routing decision (FE may switch screen)
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class ToolContext:
    """
    Per-invocation context the dispatcher hands to every tool.

    Tools should NOT reach into Postgres directly; instead they call into
    `apps/api` via `ctx.api_client`. The session_flags dict is read-only
    state harvested upstream (e.g. is_vip, zone_paused) — handy for tools
    that adjust tone or short-circuit.
    """

    tenant_id: str
    customer_id: Optional[str] = None
    session_id: Optional[str] = None
    waiter_id: Optional[str] = None
    is_staff: bool = False
    is_manager: bool = False
    session_flags: dict[str, Any] = field(default_factory=dict)
    # Optional callable: (method, path, body) -> dict. Injected by the
    # FastAPI handler. Tools that don't need network calls leave it None.
    api_client: Optional[Callable[..., Any]] = None
    # Original raw user message — useful for tools that want to relay verbatim
    # text (e.g. complaint_compose passing the customer's words to the host).
    raw_message: Optional[str] = None


@dataclass
class ToolResult:
    """
    What a tool returns to the dispatcher.

    Wire-compatible with the FE-side ToolCall result envelope. Fields are
    optional because some tools only emit a payload (silent dispatch) and
    others only emit a message (chat-style replies).
    """

    message: Optional[str] = None
    chips: list[dict[str, Any]] = field(default_factory=list)
    # Used by `silent` tools that nonetheless emit a side-effect payload the
    # FE should react to (e.g. lgpd_erase_chat returning the protocol number).
    silent: bool = False
    # Free-form payload routed to FE for action (e.g. screen navigation,
    # tool-specific result). Opaque to the dispatcher.
    action_payload: Optional[dict[str, Any]] = None
    # If True, FE should swap to a different screen (router-style tools).
    router_target: Optional[str] = None
    # Errors propagate via this field instead of raising — tools shouldn't
    # crash the orchestrator. Status codes follow HTTP conventions.
    error: Optional[dict[str, Any]] = None


@dataclass
class ToolMeta:
    """Registry entry for a single tool."""

    name: str
    call: Callable[[dict[str, Any], ToolContext], ToolResult]
    silent: bool = False
    requires_text: bool = False
    router: bool = False
    audience: str = "customer"  # "customer" | "staff" | "manager"
