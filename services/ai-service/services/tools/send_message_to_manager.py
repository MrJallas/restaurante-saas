"""
Send a free-text message to the manager (canonical name per F2 spec).

Renamed from `staff_message_send` — same semantics. The legacy
`staff_message_send` forwarding module was removed in P1 #30.

Requires `text` arg (validated by dispatcher via STAFF_TOOLS_REQUIRING_TEXT).

Round 22 (send_message_to_manager bugfix): tool não bate mais no HTTP
direto via `ctx.api_client`. Antes hitava `POST /:tenant/staff-messages`
(staff↔staff endpoint protegido por StaffOnlyGuard) sem credentials
de staff → 401 silencioso. Mensagem nunca chegava no manager mesmo o
customer vendo "Mensagem enviada".

Agora a persistência é feita server-side pelo `AssistantService` em
`apps/api/src/modules/assistant/assistant.service.ts`: depois da
dispatch da tool, o serviço chama `CustomerStaffMessagesService
.appendOutbound()` (trusted in-process, tem tenant/customer/session
no contexto) que escreve em `staff_threads` + `staff_messages` (Mongo
30d TTL) e emite o WS event `staff_messages.customer_replied`.

A tool retorna apenas o message+chips visíveis — é a interface entre
o LLM e o turno do chat.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    # `text` non-empty is enforced by the dispatcher (STAFF_TOOLS_REQUIRING_TEXT).
    text = args["text"].strip()
    target_session_id = args.get("sessionId")

    # Round 4 §C-NEW-3 — chips: enquanto espera resposta, opções típicas.
    return ToolResult(
        message="Mensagem enviada ao gerente.",
        chips=[
            {"id": "view_menu", "label": "Ver cardápio", "action": "navigate", "payload": "cardapio"},
            {"id": "view_order", "label": "Ver pedido", "action": "send", "payload": "ver meu pedido"},
            {"id": "call_waiter", "label": "Chamar garçom", "action": "send", "payload": "chamar o garçom"},
        ],
        action_payload={
            "messageSent": True,
            "toSessionId": target_session_id,
            # Texto enviado fica no payload pra o BE (AssistantService) gravar
            # via CustomerStaffMessagesService.appendOutbound. Tools-side
            # access ao `text` original.
            "text": text,
        },
    )
