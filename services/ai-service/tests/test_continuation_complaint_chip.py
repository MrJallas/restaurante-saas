"""
Framework bugfix: chip "Ver chat" pós-reclamação -> 404.

Os templates `pos_reclamacao` emitem o chip:
    {"id": "ver-chat", "action": "navigate", "payload": "complaint-thread"}

Mas a rota real no web-customer é `/{slug}/complaints` (lista) ou
`/{slug}/complaints/{id}` (thread). O FE resolve navigate por
`/${slug}/${payload}`, então "complaint-thread" vira `/{slug}/complaint-thread`
== 404 (essa rota não existe).

O AI service não recebe o complaintId nos slots (o apps/api tem o id em
`eventId` mas não o repassa como slot), então o fix seguro dentro da alçada
é apontar pro deep-link que funciona SEM id: a lista `/{slug}/complaints`.

RED: existe chip navigate com payload "complaint-thread".
GREEN: nenhum chip aponta pra "complaint-thread"; o "Ver chat" navega pra
uma rota real ("complaints" ou "complaints/{id}").
"""

from services.continuation import DEFAULTS


def _navigate_chips(entries):
    for entry in entries:
        for chip in entry.get("chips", []):
            if chip.get("action") == "navigate":
                yield entry, chip


def test_no_complaint_thread_404_payload():
    bad = [
        (entry["id"], chip)
        for entry, chip in _navigate_chips(DEFAULTS["pos_reclamacao"])
        if chip.get("payload") == "complaint-thread"
    ]
    assert not bad, (
        f"chips navigate pra 'complaint-thread' (404): {bad} — a rota real é "
        "/{slug}/complaints"
    )


def test_ver_chat_points_to_real_complaints_route():
    ver_chat_payloads = [
        chip.get("payload")
        for entry, chip in _navigate_chips(DEFAULTS["pos_reclamacao"])
        if chip.get("id") == "ver-chat"
    ]
    assert ver_chat_payloads, "esperava pelo menos um chip 'ver-chat' navigate"
    for payload in ver_chat_payloads:
        assert payload == "complaints" or (payload or "").startswith("complaints/"), (
            f"chip 'ver-chat' aponta pra {payload!r}; precisa ser 'complaints' "
            "(lista) ou 'complaints/{id}' (thread)"
        )
