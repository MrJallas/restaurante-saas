"""
OpenAI-compatible tool/function schemas for the canonical tool set.

LM Studio (qwen2.5-7b-instruct-mlx) speaks the OpenAI function-calling wire
format strictly: every entry must declare `parameters` as a JSON Schema
object with `type: "object"`, `properties`, and an explicit `required` list
(arrays cannot be `null` — empty `[]` is fine when nothing is required).

These schemas are what we pass to `client.chat.completions.create(tools=...)`;
the model then emits `choice.message.tool_calls` which the orchestrator
parses (see `services/llm/providers/openai_provider.py`).

Only the **canonical** tool subset is advertised to the LLM. Deprecated
aliases are still callable via `dispatch_tool` for backward-compat, but we
don't tell the model about them — keeps the prompt focused.

Keep schemas minimal: every extra property bloats the prompt and
increases the chance of the model hallucinating arg names that don't match.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def _function(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    """Wrap a function definition in the OpenAI tools envelope."""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required or [],
                # additionalProperties=true would let the model invent fields;
                # set false to force it to stick to the schema.
                "additionalProperties": False,
            },
        },
    }


# ─────────────────────────────────────────────────────────────
# Canonical schemas — keep names in sync with `CANONICAL_TOOL_NAMES`.
# ─────────────────────────────────────────────────────────────

TOOL_SCHEMAS: list[dict[str, Any]] = [
    # ── order/menu ───────────────────────────────────────────
    _function(
        "view_menu",
        "Abre a tela do cardápio para o cliente. Use quando o cliente pedir para ver o menu, cardápio ou opções. Se houver filtro como bebidas, sobremesas ou entradas, preencha category.",
        {
            "category": {
                "type": "string",
                "description": "Categoria opcional para filtrar (Entradas, Pratos, Sobremesas, Bebidas).",
            },
        },
    ),
    _function(
        "search_dish",
        "Busca pratos no cardápio por palavra-chave. Use quando o cliente pergunta se há um prato específico.",
        {
            "query": {"type": "string", "description": "Termo de busca (ex: 'risoto', 'frango')."},
        },
        required=["query"],
    ),
    _function(
        "check_allergens",
        "Consulta os alérgenos de um ou mais pratos. Use quando o cliente perguntar sobre restrições alimentares.",
        {
            "itemIds": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs dos pratos a checar.",
            },
        },
        required=["itemIds"],
    ),
    _function(
        "compare_dishes",
        "Compara 2 ou mais pratos lado a lado (preço, alérgenos, descrição).",
        {
            "itemIds": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs dos pratos a comparar (mínimo 2).",
            },
        },
        required=["itemIds"],
    ),
    _function(
        "recommend_dish",
        "Recomenda 2-3 pratos do cardápio. Use para sugestões gerais ou quando o cliente pede dica.",
        {
            "category": {
                "type": "string",
                "description": "Categoria opcional (entrada, principal, sobremesa, bebida).",
            },
        },
    ),
    _function(
        "add_to_order",
        "Adiciona um item ao pedido do cliente. Use quando o cliente quiser pedir um item específico do cardápio ('quero o X', 'me traz Y'), incluindo água/bebidas vendidas no menu.",
        {
            "itemId": {"type": "string", "description": "ID do prato a adicionar."},
            "quantity": {"type": "integer", "description": "Quantidade (default 1).", "minimum": 1},
            "notes": {"type": "string", "description": "Observações para a cozinha (ex: 'sem cebola')."},
        },
        required=["itemId"],
    ),
    _function(
        "view_order",
        "Mostra o pedido pendente do cliente (carrinho). Use para 'vê meu pedido', 'o que tá no carrinho'.",
        {},
    ),
    _function(
        "confirm_order",
        "Confirma e envia o pedido pendente para a cozinha. Use após o cliente confirmar que quer fechar.",
        {},
    ),

    # ── payment ──────────────────────────────────────────────
    _function(
        "split_bill",
        "Abre a tela de dividir a conta entre os clientes da mesa.",
        {
            "mode": {
                "type": "string",
                "description": "Estilo de divisão (equal, per-item, custom).",
            },
        },
    ),
    _function(
        "pay_individual",
        "Abre a tela para o cliente pagar apenas a sua parte da conta.",
        {},
    ),
    _function(
        "pay_full",
        "Abre a tela para o cliente pagar a conta inteira da mesa.",
        {},
    ),
    _function(
        "open_payment_screen",
        "Abre a tela de pagamento genérica (cliente escolhe depois entre dividir/individual/total). Use para pagar conta, fechar a conta, pedir a conta ou trazer a conta. Não combine com call_waiter.",
        {},
    ),

    # ── staff/communication ──────────────────────────────────
    _function(
        "call_waiter",
        "Chama um garçom para a mesa do cliente para ajuda/atendimento. Não use para pagar, fechar, pedir, trazer a conta, nem para água/bebida vendida no cardápio; nesses casos use open_payment_screen ou add_to_order.",
        {
            "reason": {
                "type": "string",
                "description": "Motivo opcional do chamado (ex: 'água', 'guardanapo', 'geral').",
            },
        },
    ),
    _function(
        "send_message_to_manager",
        "Envia uma mensagem livre do cliente para o gerente. Requer texto.",
        {
            "text": {"type": "string", "description": "Conteúdo da mensagem."},
        },
        required=["text"],
    ),
    _function(
        "send_complaint",
        "Abre a tela de reclamação formal para o cliente descrever um problema.",
        {
            "reason": {"type": "string", "description": "Motivo prefilado (opcional)."},
            "type": {"type": "string", "description": "Tipo da reclamação (opcional)."},
        },
    ),
    _function(
        "request_table_merge",
        "Pede para juntar a mesa do cliente com outra mesa. Se o cliente não disser qual mesa, deixe targetTable ausente para abrir o mapa do salão.",
        {
            "targetTable": {"type": "string", "description": "Número ou label da mesa-alvo."},
        },
    ),
    _function(
        "accept_join_request",
        "Aprova um pedido pendente de entrada de participante na mesa. Use quando o host responder 'pode', 'sim', 'deixa entrar' ou equivalente a uma solicitação pendente.",
        {
            "targetCustomerId": {
                "type": "string",
                "description": "UUID do cliente pendente que pediu para entrar.",
            },
            "reason": {
                "type": "string",
                "description": "Texto opcional com a confirmação do host.",
            },
        },
        required=["targetCustomerId"],
    ),
    _function(
        "reject_join_request",
        "Recusa um pedido pendente de entrada de participante na mesa. Use quando o host responder 'não', 'agora não', 'recusa' ou equivalente a uma solicitação pendente.",
        {
            "targetCustomerId": {
                "type": "string",
                "description": "UUID do cliente pendente que pediu para entrar.",
            },
            "reason": {
                "type": "string",
                "description": "Texto opcional com a recusa do host.",
            },
        },
        required=["targetCustomerId"],
    ),

    # ── lgpd / history ───────────────────────────────────────
    _function(
        "delete_chat",
        "Apaga uma conversa específica do histórico do cliente.",
        {
            "threadId": {"type": "string", "description": "ID da conversa (thread)."},
        },
        required=["threadId"],
    ),
    _function(
        "delete_all_chats",
        "Apaga todas as conversas do cliente (mass delete · UI-driven).",
        {},
    ),
    _function(
        "view_chat_history",
        "Abre a tela de histórico de conversas do cliente. Use quando o cliente pedir para ver conversas antigas, histórico de chat ou mensagens anteriores.",
        {},
    ),
    _function(
        "lgpd_data_request",
        "Handoff reservado ao botão confirmado do aplicativo. O modelo não executa exclusão; para qualquer intenção LGPD, use show_lgpd_notice.",
        {
            "type": {
                "type": "string",
                "description": "Tipo da requisição (erasure, access, portability). Default: erasure.",
            },
        },
    ),
    _function(
        "show_lgpd_notice",
        "Mostra o aviso LGPD canônico + 2 chips de consentimento. Use para toda intenção LGPD; somente o botão do aplicativo pode executar a exclusão.",
        {},
    ),

    # ── info ─────────────────────────────────────────────────
    _function(
        "view_courtesy",
        "Mostra cortesias (brindes/compensações) que o cliente tem na mesa.",
        {},
    ),
    _function(
        "ask_about_restaurant",
        "Pergunta genérica sobre o restaurante (horário, localização, estacionamento, kid-friendly).",
        {
            "topic": {
                "type": "string",
                "description": "Tópico da pergunta (opcional · ajuda no log).",
            },
        },
    ),
    _function(
        "rate_visit",
        "Abre a tela de avaliação da visita.",
        {},
    ),
]


def _remove_descriptions(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _remove_descriptions(child)
            for key, child in value.items()
            if key != "description"
        }
    if isinstance(value, list):
        return [_remove_descriptions(child) for child in value]
    return value


def _compact_tool_schema(schema: dict[str, Any]) -> dict[str, Any]:
    compact = _remove_descriptions(deepcopy(schema))
    fn = compact.get("function", {})
    name = fn.get("name", "tool")
    fn["description"] = f"Execute {name} quando a intenção do cliente corresponder."
    return compact


def get_tool_schemas(compact: bool = False) -> list[dict[str, Any]]:
    """Return the OpenAI-compatible tool schema list (one per canonical tool)."""
    if compact:
        return [_compact_tool_schema(schema) for schema in TOOL_SCHEMAS]
    return list(TOOL_SCHEMAS)


def get_canonical_tool_schema_names() -> set[str]:
    """Return the set of tool names advertised to the LLM."""
    return {entry["function"]["name"] for entry in TOOL_SCHEMAS}


__all__ = [
    "TOOL_SCHEMAS",
    "get_tool_schemas",
    "get_canonical_tool_schema_names",
]
