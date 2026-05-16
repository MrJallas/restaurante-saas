# Cozinha KDS — Routes Tested

**Subagent:** 20 — Cozinha screen (KDS-style)
**Branch:** `fix/customer-tools-and-continuation`
**Tenant:** `restaurant_dev`
**Cook identity:** `staffId=70c63f26-cf4f-4076-9623-6c3ce7228982`, `staffRole=cook`
**Viewport:** 1280x800 (desktop, KDS-style)
**Run date:** 2026-05-15

---

## Routes audited

| # | Route | Status | Auth required | Polling | Notes |
|---|-------|--------|---------------|---------|-------|
| 1 | `/cozinha` | OK (200) | x-staff-key + x-staff-id + x-staff-role | 5s | 3-column kanban (NOVOS / PREPARANDO / PRONTOS); polls `GET /api/restaurant_dev/orders`. |
| 2 | `/cozinha/eu` | OK (200) | No auth (URL query params optional) | none | Cook profile; reads `?name=&initials=&shift=` from query string with fallbacks. |

---

## /cozinha (KDS Kanban)

- Source: `apps/web-staff/src/app/cozinha/page.tsx`
- Renders **at order-level** (not order_item). Each card shows order ID, age timer, items, action button.
- Filters: hides `delivered` and `cancelled`.
- Columns map by `order.status`:
  - **NOVOS** -> `received | open | confirmed`
  - **PREPARANDO** -> `in_progress | preparing`
  - **PRONTOS** -> `ready`
- Action buttons:
  - `Preparar` (yellow) -> `PATCH /orders/:id/status { status: 'in_progress' }`
  - `Pronto!` (orange) -> `PATCH /orders/:id/status { status: 'ready' }`
  - `Entregue` (green) -> `PATCH /orders/:id/status { status: 'delivered' }`
- Header buttons:
  - `Som ON/OFF` toggle (client-side `useState`, classes switch green/red)
  - `Perfil` (aria-label="Perfil") -> `router.push('/cozinha/eu')`

### Observed counts (at 20:18 BRT)

| Column | Count |
|---|---|
| NOVOS | 5 |
| PREPARANDO | 1 |
| PRONTOS | 2 |

Cards observed (id prefix + items):
- `#a6bb6426` 1x Risoto de Funghi - Preparar
- `#e387eb1d` 1x Nhoque ao Sugo - Preparar
- `#9d837970` 1x Risoto de Funghi - Preparar
- `#7ce262fa` 1x Nhoque ao Sugo - Preparar
- `#67b93b85` 1x Picanha na Brasa, 2x Pudim da Casa - Preparar (multi-item order)
- `#9a8b8984` 1x Risoto de Funghi - Pronto! (in PREPARANDO column)
- `#abb40f71` 1x Nhoque ao Sugo - Entregue (in PRONTOS column)
- `#f9bb2fe6` 2x Risoto de Funghi - Entregue (in PRONTOS column)

---

## /cozinha/eu (Cook profile)

- Source: `apps/web-staff/src/app/cozinha/eu/page.tsx`
- Same dark palette as KDS for visual continuity.
- Reads display fields from URL query params (`?name=`, `?initials=`, `?shift=`) with defaults: `Cozinheiro` / `C` / `17:00 — 23:00`.
- Stats cards `PEDIDOS HOJE` and `TEMPO MEDIO` show placeholders (`—`) — TODO for backend wire-up.
- Three action rows:
  - `Mensagens` -> `/waiter/mensagens` (reuses waiter messages screen)
  - `Configuracoes de som` -> `/cozinha` (currently just returns to KDS)
  - `Sair` (logout) -> clears `sessionStorage`, removes `staffId`/`staffRole` from `localStorage`, pushes `/`.

### Observed text on /cozinha/eu

```
Cozinha — Perfil
C
Cozinheiro
COZINHEIRO
TURNO DE HOJE
17:00 — 23:00
PEDIDOS HOJE
—
TEMPO MEDIO
—
Mensagens >
Configuracoes de som >
Sair
```

---

## Environment notes

- `NEXT_PUBLIC_API_URL` is baked at build time to `http://192.168.43.12:3001/api` (LAN IP). Audit ran with a Playwright `page.route` rewrite -> `localhost:3001` for the first session; later screenshots were captured without the rewrite (browser still reached `localhost` because the dev build was rebuilt to use it). Subsequent navigations from other parallel sub-agents repeatedly hijacked the active tab to `/host` and `/waiter`, so the KDS captures were taken on a freshly-opened tab to bypass.
