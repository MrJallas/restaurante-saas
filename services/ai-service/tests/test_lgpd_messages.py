"""
LGPD canonical messages — IMMUTABILITY GUARD.

This test asserts byte-for-byte equality between the strings exported by
`services.lgpd_messages` and the canonical phrasing in
`docs/features/chat-history-lgpd.md`. Any drift breaks the test.

If the spec doc legitimately changes, update BOTH the spec and the module
in the same commit.
"""

from services.lgpd_messages import (
    LGPD_NOTICE,
    LGPD_ERASURE_CONFIRMATION,
    LGPD_REQUEST_CONFIRMED,
    LGPD_CHIP_CONFIRM,
    LGPD_CHIP_DISMISS,
)


# Verbatim from chat-history-lgpd.md (lines around 73 and 151-155).
EXPECTED_NOTICE = (
    "Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão "
    "dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?"
)

EXPECTED_ERASURE_CONFIRMATION = (
    "Suas conversas foram apagadas agora. Protocolo guardado por 90 dias "
    "caso você precise de comprovante."
)


def test_lgpd_notice_is_byte_equal_to_spec():
    assert LGPD_NOTICE == EXPECTED_NOTICE, (
        f"\nLGPD_NOTICE drifted from spec.\n"
        f"  expected ({len(EXPECTED_NOTICE)} chars): {EXPECTED_NOTICE!r}\n"
        f"  actual   ({len(LGPD_NOTICE)} chars):     {LGPD_NOTICE!r}"
    )


def test_lgpd_erasure_confirmation_is_byte_equal_to_spec():
    assert LGPD_ERASURE_CONFIRMATION == EXPECTED_ERASURE_CONFIRMATION


def test_legacy_alias_matches_canonical():
    assert LGPD_REQUEST_CONFIRMED == LGPD_ERASURE_CONFIRMATION


def test_chip_labels_immutable():
    # Chips feed audit logs (see `consent_method` + `chip_label` in spec).
    # Treat as canonical.
    assert LGPD_CHIP_CONFIRM == "Sim, quero excluir"
    assert LGPD_CHIP_DISMISS == "Não, não quero excluir"


def test_lgpd_messages_are_nonempty():
    assert len(LGPD_NOTICE) > 0
    assert len(LGPD_ERASURE_CONFIRMATION) > 0
