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
    # staff/communication (6)
    "call_waiter", "send_message_to_manager", "send_complaint",
    "request_table_merge", "accept_join_request", "reject_join_request",
    # lgpd / history (5)
    "delete_chat", "delete_all_chats", "view_chat_history", "lgpd_data_request",
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


def test_canonical_count_is_26():
    """Prompt 13 adds join-request accept/reject tools to the customer set."""
    assert len(CANONICAL_TOOL_NAMES) == 26


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


def test_view_order_uses_status_copy_for_eta_question():
    ctx = ToolContext(
        tenant_id="t1",
        customer_id="c1",
        raw_message="quanto tempo demora o pedido?",
    )
    result = dispatch_tool("view_order", {}, ctx)
    assert "status" in result.message.lower()


def test_view_order_uses_adjust_copy_for_generic_change_request():
    ctx = ToolContext(
        tenant_id="t1",
        customer_id="c1",
        raw_message="quero mudar meu pedido",
    )
    result = dispatch_tool("view_order", {}, ctx)
    assert "ajustar" in result.message.lower()


def test_request_table_merge_no_target_requests_salon_picker():
    """No explicit target should open the customer salon picker."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1")
    result = dispatch_tool("request_table_merge", {}, ctx)
    assert result.error is None
    assert result.action_payload["requiresTargetSelection"] is True


def test_join_request_tools_return_frontend_action_payloads():
    """Join decisions are browser-session actions, not AI-service HTTP calls."""
    ctx = ToolContext(tenant_id="t1", customer_id="host-1", session_id="session-1")

    accept = dispatch_tool(
        "accept_join_request",
        {"targetCustomerId": "12345678-1234-4234-8234-123456789012"},
        ctx,
    )
    reject = dispatch_tool(
        "reject_join_request",
        {"targetCustomerId": "12345678-1234-4234-8234-123456789012"},
        ctx,
    )

    assert accept.error is None
    assert accept.action_payload["action"] == "decide_join_request"
    assert accept.action_payload["decision"] == "approve"
    assert accept.action_payload["targetCustomerId"] == "12345678-1234-4234-8234-123456789012"
    assert accept.chips

    assert reject.error is None
    assert reject.action_payload["action"] == "decide_join_request"
    assert reject.action_payload["decision"] == "reject"
    assert reject.action_payload["targetCustomerId"] == "12345678-1234-4234-8234-123456789012"
    assert reject.chips


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


# ─────────────────────────────────────────────────────────────
# P0 — gate de confirmação para tools DESTRUTIVAS/irreversíveis
#
# `delete_all_chats` (e `delete_chat`) apagam dados do cliente de forma
# irreversível ("não tem volta"). Um LLM alucinando ou um prompt malicioso
# do cliente ("apaga tudo") NÃO pode disparar a deleção na 1ª emissão sem
# uma confirmação explícita. O dispatcher exige `confirm=true` — sem isso a
# tool NÃO deleta; volta pedindo confirmação com chip que reenvia a tool.
# ─────────────────────────────────────────────────────────────

from services.tools import DESTRUCTIVE_TOOLS  # noqa: E402


class _RecordingApiClient:
    """Registra chamadas HTTP pra provar que o backend NÃO foi tocado."""

    def __init__(self):
        self.calls: list[tuple] = []

    def __call__(self, method, path, body):
        self.calls.append((method, path, body))
        return {"deletedCount": 99}


def test_destructive_tools_set_contains_deletes():
    """delete_all_chats + delete_chat são deleções irreversíveis."""
    assert "delete_all_chats" in DESTRUCTIVE_TOOLS
    assert "delete_chat" in DESTRUCTIVE_TOOLS


def test_delete_all_chats_without_confirm_does_not_delete():
    """RED: sem confirm, a tool NÃO chama o backend de deleção."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_all_chats", {}, ctx)
    # Nenhuma chamada DELETE foi feita — nada apagado.
    assert api.calls == [], f"backend foi tocado sem confirmação: {api.calls}"
    # Volta pedindo confirmação (não é erro, é um gate), com chip pra reenviar.
    assert result.error is None
    assert result.chips, "gate destrutivo deve oferecer chip de confirmação"
    labels = " ".join(c.get("label", "").lower() for c in result.chips)
    assert "apagar" in labels or "confirm" in labels or "sim" in labels
    # Um dos chips reenvia a MESMA tool com confirm=true.
    confirm_chip = next(
        (
            c for c in result.chips
            if isinstance(c.get("payload"), dict)
            and c["payload"].get("tool") == "delete_all_chats"
            and (c["payload"].get("args") or {}).get("confirm") is True
        ),
        None,
    )
    assert confirm_chip is not None, f"faltou chip de confirmação re-emitindo a tool: {result.chips}"


def test_delete_all_chats_with_confirm_from_chip_deletes():
    """GREEN path A2: com confirm=true VINDO DO CHIP (out-of-band, humano), deleta.

    O invariante é: confirmação só vale quando a ORIGEM do dispatch é o chip
    tocado pelo humano (`origin="chip"`), nunca o token-stream do LLM.
    """
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_all_chats", {"confirm": True}, ctx, origin="chip")
    assert len(api.calls) == 1, f"esperava 1 DELETE, veio: {api.calls}"
    method, path, _ = api.calls[0]
    assert method == "DELETE"
    assert result.error is None


# ─────────────────────────────────────────────────────────────
# P0 REGRESSÃO (re-scan) — o gate estava furado dos DOIS lados.
# A1 (BYPASS): o modelo forja confirm=true no token-stream do LLM e DELETA
#   sem toque humano. O confirm NÃO pode vir dos args controlados pelo LLM.
# A2 (CAMINHO LEGÍTIMO): só o chip out-of-band (humano) pode confirmar.
# Invariante: confirmação vem SÓ de um sinal out-of-band (origin="chip"),
# NUNCA do fluxo do LLM (origin default "llm" / qualquer coisa != "chip").
# ─────────────────────────────────────────────────────────────


def test_a1_llm_forged_confirm_does_not_delete_default_origin():
    """A1: confirm=true pelo caminho do LLM (origin default) é IGNORADO — NÃO deleta.

    Reproduz o threat-model: um LLM alucinando/jailbroken emite
    {"confirm": true}. O dispatch default (o do loop de tool-calls do LLM
    em main.py) NÃO pode honrar esse confirm. Em vez de deletar, volta o
    gate de confirmação (chip out-of-band) — o humano ainda tem que tocar.
    """
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    # origin default = "llm" (o loop de tool-calls chama posicionalmente)
    result = dispatch_tool("delete_all_chats", {"confirm": True}, ctx)
    assert api.calls == [], f"A1 BYPASS: o modelo deletou forjando confirm: {api.calls}"
    # Continua sendo um gate, não erro — devolve chip pra confirmação humana.
    assert result.error is None
    assert result.chips, "gate deve oferecer chip de confirmação out-of-band"
    confirm_chip = next(
        (
            c for c in result.chips
            if isinstance(c.get("payload"), dict)
            and c["payload"].get("tool") == "delete_all_chats"
            and (c["payload"].get("args") or {}).get("confirm") is True
        ),
        None,
    )
    assert confirm_chip is not None


def test_a1_llm_forged_confirm_explicit_origin_does_not_delete():
    """A1: mesmo com origin='llm' EXPLÍCITO, confirm forjado é stripado — NÃO deleta."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_all_chats", {"confirm": "sim"}, ctx, origin="llm")
    assert api.calls == [], f"A1 BYPASS via origin=llm explícito: {api.calls}"
    assert result.error is None
    assert result.chips


def test_a2_chip_out_of_band_confirm_deletes():
    """A2: o caminho do chip (out-of-band, humano) COM confirm DELETA — o humano consegue."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_all_chats", {"confirm": True}, ctx, origin="chip")
    assert len(api.calls) == 1, f"A2 QUEBRADO: humano não conseguiu deletar: {api.calls}"
    assert api.calls[0][0] == "DELETE"
    assert result.error is None


def test_a2_chip_confirm_preserves_thread_target_and_deletes():
    """A2 (delete_chat): chip out-of-band preserva threadId e deleta o alvo certo."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool(
        "delete_chat", {"threadId": "thr-1", "confirm": True}, ctx, origin="chip"
    )
    assert len(api.calls) == 1, f"A2 delete_chat não deletou: {api.calls}"
    method, path, _ = api.calls[0]
    assert method == "DELETE"
    assert "thr-1" in path, f"alvo do delete perdido: {path}"
    assert result.error is None


def test_a1_delete_chat_llm_forged_confirm_does_not_delete():
    """A1 (delete_chat): confirm forjado pelo LLM com threadId presente NÃO deleta."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_chat", {"threadId": "thr-1", "confirm": True}, ctx)
    assert api.calls == [], f"A1 delete_chat BYPASS: {api.calls}"
    assert result.error is None
    # Volta o gate com chip re-emitindo a MESMA tool (threadId preservado).
    confirm_chip = next(
        (
            c for c in result.chips
            if isinstance(c.get("payload"), dict)
            and c["payload"].get("tool") == "delete_chat"
            and (c["payload"].get("args") or {}).get("confirm") is True
        ),
        None,
    )
    assert confirm_chip is not None
    assert (confirm_chip["payload"]["args"] or {}).get("threadId") == "thr-1"


def test_delete_chat_without_confirm_does_not_delete():
    """RED: delete_chat também é gated mesmo com threadId presente."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool("delete_chat", {"threadId": "thr-1"}, ctx)
    assert api.calls == [], f"delete_chat tocou o backend sem confirmação: {api.calls}"
    assert result.error is None
    assert result.chips
    confirm_chip = next(
        (
            c for c in result.chips
            if isinstance(c.get("payload"), dict)
            and c["payload"].get("tool") == "delete_chat"
            and (c["payload"].get("args") or {}).get("confirm") is True
        ),
        None,
    )
    assert confirm_chip is not None
    # O threadId original deve ser preservado no re-emit pra não perder o alvo.
    assert (confirm_chip["payload"]["args"] or {}).get("threadId") == "thr-1"


def test_delete_chat_with_confirm_from_chip_deletes():
    """delete_chat só deleta com confirm vindo do chip out-of-band (origin='chip')."""
    api = _RecordingApiClient()
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1", api_client=api)
    result = dispatch_tool(
        "delete_chat", {"threadId": "thr-1", "confirm": True}, ctx, origin="chip"
    )
    assert len(api.calls) == 1, f"esperava 1 DELETE, veio: {api.calls}"
    assert result.error is None


def test_non_destructive_tool_not_gated():
    """add_to_order (mutação normal) NÃO ganha o gate — dispara direto."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1")
    result = dispatch_tool(
        "add_to_order",
        {"itemId": "12345678-1234-4234-8234-123456789012", "quantity": 1},
        ctx,
    )
    # Não pede confirm — nenhum chip re-emitindo add_to_order com confirm.
    reconfirm = [
        c for c in (result.chips or [])
        if isinstance(c.get("payload"), dict)
        and (c["payload"].get("args") or {}).get("confirm") is True
    ]
    assert reconfirm == [], "add_to_order não deve pedir confirmação destrutiva"


# ─────────────────────────────────────────────────────────────
# Round 4 §C-NEW-3 — chips canônicos pós-mutação
# Cada tool customer-side de mutação deve retornar `chips` não-vazio
# pra que o FE renderize follow-ups contextuais (em vez do trio estático).
# ─────────────────────────────────────────────────────────────

CUSTOMER_TOOLS_WITH_CHIPS = [
    # mutation tools — happy paths sem api_client retornam chips canon
    ("change_order", {"orderId": "abc", "changes": {"notes": "sem cebola"}}),
    ("remove_from_cart", {"itemId": "abc"}),
    ("cancel_order", {"orderId": "abc"}),
    ("confirm_order", {}),
    ("ask_about_restaurant", {"topic": "horário"}),
    ("view_chat_history", {}),
    ("view_courtesy", {}),
]


@pytest.mark.parametrize("tool_name,args", CUSTOMER_TOOLS_WITH_CHIPS)
def test_customer_mutation_tool_returns_chips(tool_name, args):
    """Round 4 §C-NEW-3 — happy path de cada tool deve trazer chips."""
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1")
    result = dispatch_tool(tool_name, args, ctx)
    assert result.error is None, f"{tool_name} retornou erro: {result.error}"
    assert result.chips, f"{tool_name} sem chips — round 4 spec exige follow-ups canon"
    assert len(result.chips) >= 2, f"{tool_name} chips < 2"
    for chip in result.chips:
        assert chip.get("label"), f"{tool_name} chip sem label: {chip}"
        assert chip.get("action") in {"send", "navigate", "expand"}, (
            f"{tool_name} chip action inválido: {chip}"
        )


def test_chips_coverage_at_least_9_of_10_mutations():
    """Round 4 §C-NEW-3 acceptance: ≥ 9/10 mutações com chips."""
    mutations = [
        "add_to_order", "change_order", "remove_from_cart", "cancel_order",
        "confirm_order", "request_table_merge", "send_complaint",
        "send_message_to_manager", "ask_about_restaurant", "view_chat_history",
    ]
    ctx = ToolContext(tenant_id="t1", customer_id="c1", session_id="s1")
    args_for = {
        "add_to_order": {"itemId": "12345678-1234-4234-8234-123456789012", "quantity": 1},
        "change_order": {"orderId": "abc", "changes": {"notes": "x"}},
        "remove_from_cart": {"itemId": "abc"},
        "cancel_order": {"orderId": "abc"},
        "confirm_order": {},
        "request_table_merge": {"targetTable": "14"},
        "send_complaint": {},
        "send_message_to_manager": {"text": "hello"},
        "ask_about_restaurant": {"topic": "horário"},
        "view_chat_history": {},
    }
    with_chips = 0
    for name in mutations:
        try:
            res = dispatch_tool(name, args_for[name], ctx)
            if res.chips and len(res.chips) >= 1:
                with_chips += 1
        except Exception:
            pass
    assert with_chips >= 9, f"chips coverage = {with_chips}/10 (< 9 — round 4 spec falhou)"
