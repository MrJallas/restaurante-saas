# /manager/kitchen-reorder — Audit R23

## Surface

- Route: `/manager/kitchen-reorder?slug=restaurant_dev`
- Page: `apps/web-staff/src/app/manager/kitchen-reorder/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerKitchenReorder.tsx`

## NOT drag-drop

Rubric mentioned "drag-drop reordering dispara `PATCH /orders/:id/queue-position`".
**That is NOT what this screen does.** This is a select-and-confirm flow:

1. Manager taps queue rows to toggle selection (checkboxes).
2. Optional `<textarea>` "Por quê" reason.
3. Press "Avisar cozinha · N pedidos" CTA.
4. State machine: `select → sent → accepted`.

No drag-drop, no `PATCH /orders/:id/queue-position` request. Confirmed via
`browser_network_requests` filter `queue|kitchen|reorder|orders` — 0 hits.

## Mock data (lines 42-48)

5 queue items pre-loaded inline. No GET on mount.

| id | table | items | minutes | meta | late | waiter |
|---|---|---|---|---|---|---|
| `#142` | 14 | Risoto cogumelos | 22 | 12 | yes | Olivia M. |
| `#143` | 7 | Filé + risoto · 2 pratos | 18 | 12 | yes | Caleb S. |
| `#144` | 9 | Pizza margherita | 15 | 18 | no | Henrique L. |
| `#145` | 12 | Salada césar · 2 | 8 | 8 | no | Caleb S. |
| `#146` | 5 | Tagliatelle · 1 prato | 5 | 14 | no | Olivia M. |

Default selection: `#142` and `#143` (the 2 late ones).

## State-machine verified

| state | hero | CTA |
|---|---|---|
| `select` (initial) | "Cozinha lenta agora · Fila com 11 pedidos · 2 já passaram da meta" | "Avisar cozinha · 2 pedidos" |
| `select` (after Mesa 9 toggle) | (same) | "Avisar cozinha · 3 pedidos" |
| `sent` | "Aguardando cozinha · Aviso enviado · cozinha vai responder · Resposta esperada em ~30 segundos." | "Cancelar pedido de reordem" |
| `accepted` (after 3s timeout) | "Cozinha aceitou · Pedidos foram puxados pra frente · Os garçons das mesas afetadas foram avisados." | "Voltar pra Operação" |

`onConfirm` line 95-100:
```ts
const onConfirm = () => {
  if (selectedItems.length === 0) return;
  setState('sent');
  // Mock: cozinha responde em 3s
  setTimeout(() => setState('accepted'), 3000);
};
```

## Buttons

- 1 Voltar topbar (→ `/manager/operacoes`)
- 5 Queue row toggles (one per item)
- 1 CTA (varies per state) + 1 Cancel/Back btn depending on state
- 5 MBottomNav (active='ops')

CTA disabled when `selectedItems.length === 0` (verified by source line 419).

## Findings

- **Functional UI, mock data, no backend.** The doc-comment at the top
  of the screen file (lines 9-13) explicitly marks this as TODO Onda 4:
  `GET /kitchen/queue`, `POST /kitchen/reorder`, WebSocket for accepted.
- The 3-second `setTimeout` from `sent → accepted` is hardcoded — no
  cozinha confirmation flow, just a stub timer.
- The "Cancelar pedido de reordem" button works locally (`setState('select')`),
  but since nothing was actually sent, there's nothing to cancel.
- "Voltar pra Operação" routes back to `/manager/operacoes`.

## Backend status

- No endpoint `PATCH /orders/:id/queue-position` exists.
- No endpoint `POST /kitchen/reorder` exists either.
- Screen is fully placebo (cosmetic state machine) until Onda 4.

## Screenshots

- `05-kitchen-reorder-select.png` — initial select state with 2 pre-checked
- `05-kitchen-reorder-sent.png` — after Avisar cozinha · 3 pedidos
- `05-kitchen-reorder-accepted.png` — after 3s, kitchen 'accepts'
