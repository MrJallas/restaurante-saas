# /manager/compensate — Audit R23

## Surface

- Route: `/manager/compensate?slug=restaurant_dev[&tableNumber=N&tableSessionId=UUID]`
- Page: `apps/web-staff/src/app/manager/compensate/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerCompensateClient.tsx`
- API: `POST /:slug/courtesies` (migration `042`)

## 6 Cortesia types (canon V20)

All 6 buttons verified rendered as a 2×3 grid (lines 36-48 of screen):

| id | label | sub (helper) | defaultItem |
|---|---|---|---|
| `Sobremesa` | Sobremesa | Da casa | `Fondant de chocolate · 2 porções` |
| `Drink` | Drink | Bar manda | `Caipirinha · 2 doses` |
| `Couvert` | Couvert | Por conta | `Couvert (R$ 18) sai da conta` |
| `Desconto` | Desconto | % no total | `15% de desconto na conta` |
| `Mensagem` | Mensagem | Sem brinde | `Obrigado pela visita!` |
| `Outro` | Outro | Personalizado | `` (empty) |

Active type starts as `Sobremesa` (`aria-pressed=true`). Picking another
type rewrites the description input with that type's defaultItem (via
`onPickType` line 115-119).

## Form fields

- **Pra qual mesa** — list of host tables filtered to `active_session_id`
  (occupied only). At audit time: Mesa 1 (2p · Salão), Mesa 2 (1p · Salão).
- **Tipo de cortesia** — the 6 buttons above.
- **Descrição** — `<input maxLength=500>` pre-filled with type default.
- **Notas internas (opcional)** — `<textarea>` up to 500 chars.

## Submit flow

CTA "Mandar cortesia" stays disabled until `selectedTableNumber && item.trim()`
are both truthy (verified: disabled on first paint).

`onSubmit` (line 127-150):
1. `validate()` returns error message if table or item missing.
2. `manager(slug).courtesies.create({ type, item, tableNumber, tableSessionId, notes })` → `POST /api/:slug/courtesies`.
3. On success: state stores `savedId`, hero swaps to blue "Cortesia registrada · indo pra Histórico" banner.
4. `setTimeout(() => router.push('/manager/cortesias'), 2000)` redirects back to history tab.

## API verified

```bash
POST /api/restaurant_dev/courtesies
{"type":"Sobremesa","item":"AUDIT-R23-Fondant teste","tableNumber":1,
 "tableSessionId":"4a19456c-91e3-469a-80b2-185db3950f06",
 "notes":"AUDIT-R23-cortesia-via-api"}
```

Response 201:
```json
{
  "id": "68ac4a90-2794-4c13-8fdf-a66d2f035d68",
  "table_session_id": "4a19456c-91e3-469a-80b2-185db3950f06",
  "table_number": 1,
  "type": "Sobremesa",
  "item": "AUDIT-R23-Fondant teste",
  "status": "pendente",
  "manager_staff_id": "8bd06156-1fe5-4c18-a82d-43d38287ed4a",
  "manager_name": "Erica Gerente",
  "notes": "AUDIT-R23-cortesia-via-api",
  "created_at": "2026-05-15T19:38:39.690Z",
  "responded_at": null,
  "response_seconds": null
}
```

The row appeared in `/manager/cortesias?tab=history` UI immediately (KPI Hoje:1 Pendentes:1, card "Mesa 1 · Sobremesa · AUDIT-R23-Fondant teste · pendente por Erica Gerente").

## Findings

- All 6 cortesia types render and toggle correctly.
- `aria-pressed` state-tracking works (verified Sobremesa → Drink swap).
- `onPickType` correctly rewrites the description input to the new default.
- Disabled CTA gate is functional (table + item required).
- POST round-trips through the API with full audit (manager_name resolved server-side via `CallerResolverService`).
- The 2000ms setTimeout redirect back to `/manager/cortesias` after a successful submit is a real UX nicety, not a placebo.

## Backend

- `/:slug/courtesies` POST controller fully wired.
- DB schema: `restaurant_dev.courtesies` (migration 042) — manager_staff_id FK to `staff`, table_session_id FK to `table_sessions` (ON DELETE SET NULL).
- No placebos in compensate. This is the gold-standard wired surface.
