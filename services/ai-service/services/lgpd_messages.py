"""
LGPD canonical messages — IMMUTABLE.

Per `docs/produto/funcionalidades/historico-de-chat-e-lgpd.md`, the assistant NEVER composes LGPD
copy itself. The exact strings below are the spec's canonical phrasing; tests
in `tests/test_lgpd_messages.py` assert byte-for-byte equality with the spec
doc to guard against drift.

DO NOT EDIT. If the legal text needs to change, update the spec doc FIRST and
keep this module in lock-step.
"""

# Notice surfaced when the LLM detects an LGPD-related intent
# ("quero apagar meus dados", "quais meus direitos LGPD", etc.).
# Spec (historico-de-chat-e-lgpd.md, section "Textos canônicos"):
#   "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão "
#   "dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?"
LGPD_NOTICE: str = (
    "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão "
    "dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?"
)

# Confirmation rendered after `lgpd_data_request(type='erasure')` succeeds.
# Per spec, NoSQL chat data is wiped immediately; protocol is kept 90 days.
# Spec (historico-de-chat-e-lgpd.md, section "Textos canônicos"):
#   "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias "
#   "caso você precise de comprovante."
LGPD_ERASURE_CONFIRMATION: str = (
    "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias "
    "caso você precise de comprovante."
)

# Backwards-compatible alias used by older tool wiring; both names point at
# the SAME literal so the byte-equality test trivially passes for either.
LGPD_REQUEST_CONFIRMED: str = LGPD_ERASURE_CONFIRMATION

# Fallback when the assistant detects an LGPD intent but the customer is
# anonymous (no customerId). Mirrors the empty-state copy from the chat
# history screen — keep aligned with `historico-de-chat-e-lgpd.md`, section
# "Textos canônicos" (cliente sem identificação).
LGPD_REQUIRES_LOGIN: str = (
    "Pra apagar suas conversas, preciso te identificar primeiro. "
    "Faça login na próxima visita pra ver e gerenciar seu histórico."
)

# Chip labels rendered with the notice — also canonical because tap labels
# feed the audit log (`chip_label` field; spec section "Textos canônicos").
LGPD_CHIP_CONFIRM: str = "Sim, quero excluir"
LGPD_CHIP_DISMISS: str = "Não, não quero excluir"


__all__ = [
    "LGPD_NOTICE",
    "LGPD_ERASURE_CONFIRMATION",
    "LGPD_REQUEST_CONFIRMED",
    "LGPD_REQUIRES_LOGIN",
    "LGPD_CHIP_CONFIRM",
    "LGPD_CHIP_DISMISS",
]
