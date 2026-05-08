"""
LGPD notice tool — surfaces the canonical legal notice + binary consent chips.

Per `docs/features/chat-history-lgpd.md` (lines 53-117), the LLM **never**
composes LGPD copy itself. When it detects an LGPD-related intent ("quero
apagar meus dados", "quais meus direitos LGPD", etc.) it MUST call
`show_lgpd_notice` first; only after the customer confirms (via chip tap
or free-text affirmative reply) does the LLM call `lgpd_data_request`.

Tool signature: `show_lgpd_notice() -> dict`
Returns the canonical text + 2 chips (consent capture · binary).

Spec snippet (chat-history-lgpd.md, the canonical payload for this tool):
    {
      "messageType": "lgpd_notice",
      "content": LGPD_NOTICE,
      "chips": [
        { "label": "Sim, quero excluir",     "action": "lgpd_data_request" },
        { "label": "Não, não quero excluir", "action": "dismiss" }
      ]
    }

Implementation note: F2 spec asks for chip labels `"Sim, apagar"` /
`"Cancelar"`; the canonical spec doc (chat-history-lgpd.md line 75) uses
`"Sim, quero excluir"` / `"Não, não quero excluir"`. The `lgpd_messages.py`
module exports the canonical labels (`LGPD_CHIP_CONFIRM` /
`LGPD_CHIP_DISMISS`); we use those here so the chips feed the audit log
correctly. Updating the chip label here would drift from the spec doc.
"""

from typing import Any

from ..lgpd_messages import (
    LGPD_NOTICE,
    LGPD_CHIP_CONFIRM,
    LGPD_CHIP_DISMISS,
)
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    """
    Surface the canonical LGPD notice with 2 binary consent chips.

    Returns the same canonical payload regardless of args/ctx — the only
    branching is in the *next* tool the LLM calls (lgpd_data_request OR
    dismiss). FE renders the bubble normally + chips below; ToolCallIndicator
    NOT shown (silent=False but tool is FE-cosmetic only).
    """
    return ToolResult(
        message=LGPD_NOTICE,
        chips=[
            {
                "id": "lgpd-confirm",
                "label": LGPD_CHIP_CONFIRM,
                "action": "send",
                "payload": {
                    "tool": "lgpd_data_request",
                    "args": {"type": "erasure", "consentMethod": "chip", "chipLabel": LGPD_CHIP_CONFIRM},
                },
                "primary": True,
            },
            {
                "id": "lgpd-dismiss",
                "label": LGPD_CHIP_DISMISS,
                "action": "send",
                "payload": {
                    "tool": "dismiss",
                    "args": {"chipLabel": LGPD_CHIP_DISMISS},
                },
                "primary": False,
            },
        ],
        silent=False,
        action_payload={"messageType": "lgpd_notice"},
    )
