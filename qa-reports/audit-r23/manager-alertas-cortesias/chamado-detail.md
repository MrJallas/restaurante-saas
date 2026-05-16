# /manager/chamado/[id] — Audit R23

## Surface

- Route: `/manager/chamado/[id]?slug=&tenantId=&kind=complaint|qr-issue|generic`
- Page: `apps/web-staff/src/app/manager/chamado/[id]/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenCallDetail.tsx`

## Three variants via `kind` query param

| kind | Renders | Backed by |
|---|---|---|
| `complaint` | Full UI w/ description card, chip actions, textarea, resolve+respond CTAs | `GET /:slug/complaints` (list, then `find`) |
| `qr-issue` | `QrIssueDetail` panel | (stub) |
| `generic` | Just a dashed "Detalhes do chamado #{id}" card | — |

## complaint variant — verified working

Tested with complaint id `9596f501-af94-42d9-b2c8-f4ee7d5b1881` (status `responded`).
URL: `/manager/chamado/9596f501-af94-42d9-b2c8-f4ee7d5b1881?slug=restaurant_dev&kind=complaint`

The screen called `api.complaints.list()` (line 56), filtered to find the
one with matching `id`, and rendered:

- h1: "Reclamação"
- Eyebrow: "MESA · COMIDA-FRIA"
- Description card with the complaint text
- "Contactar" CTA (opens `MContactClientSheet`)

**Note: when complaint.status === 'resolved', the chip actions + textarea
block is hidden.** The test record was `responded`, not `resolved`, so the
full block rendered with:

- 4 chip toggles (single-select via `chipAction` state):
  - "Estou indo"
  - "Vou ver na cozinha"
  - "Cortesia"
  - "Texto livre"
- `<textarea maxLength=240 rows=3>` for draft response
- "Marcar como resolvido" (ghost CTA → `api.complaints.resolve(id)`)
- "Enviar resposta" (primary CTA → `api.complaints.respond(id, { content, chipAction })`)
  - Disabled while `!draft.trim() || busy` (verified disabled with empty textarea)

## generic variant — empty stub

URL: `/manager/chamado/{id}?slug=restaurant_dev&kind=generic`

Renders ONLY a dashed box: `Detalhes do chamado #{id}`. No actions. The
rubric expected "Aceitar/Acompanhar/Resolver" — those buttons do NOT exist
in this screen for `kind=generic`. The complaint variant has analogous
"Marcar como resolvido" + "Enviar resposta" + "Contactar" buttons but NOT
under those exact labels.

## Buttons (complaint variant)

1. Voltar (`router.back()`)
2. Contactar (opens sheet)
3-6. 4 chip toggles
7. Marcar como resolvido (`api.complaints.resolve`)
8. Enviar resposta (`api.complaints.respond`)

Plus a fixed BottomNav (5 buttons).

## Real backend calls

`GET /api/restaurant_dev/complaints` — returned a populated list of 13+
complaints. Resolver + respond endpoints exist in `apps/api/src/modules/complaints/`.

## Waiter calls — separate

The rubric mentioned `waiter_calls` table (and creating one with
`reason='other', notes='AUDIT-R23-test'`). But:

- `waiter_calls` schema has **no `notes` column** (`reason`, `status`,
  `acknowledged_by`, etc; no notes field).
- The `/manager/chamado/[id]` screen with `kind=generic` does NOT load a
  waiter_call from any endpoint; it just renders the id as a string in a
  dashed box. There's no "Aceitar/Acompanhar/Resolver" wiring for waiter
  calls in this screen.

So no `INSERT INTO waiter_calls ... notes='AUDIT-R23-test'` was performed
(impossible with current schema), and no waiter-call test row was needed
because the screen doesn't actually query waiter_calls.

For reference, the latest existing waiter_calls row id
`1669bbc7-4a98-468e-813a-1c8ba5b4bc00` (table_session for Mesa 1,
reason=`bring_menu`, status=`pending`) was used to load
`/manager/chamado/.../kind=generic` — the screen showed only the dashed
"Detalhes do chamado #{id}" placeholder, confirming the generic branch is
a stub.

## Findings

- **complaint** kind is fully real (list fetch + resolve + respond + chip-action
  attribution + contact sheet).
- **generic** kind is a pure placeholder.
- **qr-issue** kind (not tested here, would need a real qr-issue id).
- The naming "Aceitar/Acompanhar/Resolver" in the rubric does not match the
  actual labels. The functional analog is "Contactar / Enviar resposta /
  Marcar como resolvido".

## Screenshots

- `06-chamado-generic.png` — generic kind, dashed placeholder
- `06-chamado-complaint-real.png` — complaint with real data + actions
