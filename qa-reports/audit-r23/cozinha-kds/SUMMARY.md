Subagent: cozinha-kds
Status: PASS (2 P3 nits + 1 P2 design oversight)

Branch: fix/customer-tools-and-continuation
Cook: Diana (staffId=70c63f26-cf4f-4076-9623-6c3ce7228982)
Viewport: 1280×800 (desktop KDS-style)

## Verdict
**PASS.** /cozinha renders real DB data, all action buttons map to correct status transitions, Perfil navigates to /cozinha/eu, Som ON/OFF toggles UI state. Auth correta server-side.

## Routes
1. **/cozinha** — 3-column kanban (NOVOS/PREPARANDO/PRONTOS)
   - Source: `apps/web-staff/src/app/cozinha/page.tsx`
   - Renderiza order-level (não order_item)
   - Polls GET /orders every 5s · sem WS subscription
2. **/cozinha/eu** — cook profile
   - Source: `apps/web-staff/src/app/cozinha/eu/page.tsx`
   - Lê `?name=&initials=&shift=` da URL com defaults

## Live snapshot
- NOVOS=5, PREPARANDO=1, PRONTOS=2 = 8 active orders
- Cards bate com DB rows 1:1 (#a6bb6426 Risoto, #67b93b85 Picanha+Pudim, #abb40f71 Nhoque)

## Buttons (todos wirados real)
- **Preparar** (yellow) → PATCH /orders/:id/status {status:'in_progress'}
- **Pronto!** (orange) → PATCH /orders/:id/status {status:'ready'}
- **Entregue** (green) → PATCH /orders/:id/status {status:'delivered'}
- **Som ON/OFF** toggle (client-only state, flips green↔red, gates new-order beep)
- **Perfil** (aria-label) → router.push('/cozinha/eu') ✓
- /eu: Voltar, Mensagens → /waiter/mensagens (sem rota dedicada cook), Configurações de som (mislabeled — bounces /cozinha), Sair (clears sessionStorage + localStorage)

## Bugs novos / Achados

### 🟡 P2 — /cozinha nunca abre socket (polls 5s)
- /cozinha NÃO opens WS. Polls every 5s
- Server-side gateway EMITE pra room `tenant:<slug>:kitchen`
- Wiring is trivial mas as shipped, 5s poll é upper-bound staleness
- **Fix**: subscribe ao room kitchen no client

### 🔵 P3 — Brief event name wrong
- Brief audit pedia `order_item.status_changed` — **NÃO EXISTE**
- Eventos reais: `order:status`, `order:new`, `order:ready`
- Schema não tem `oi.status` column — status é order-level only
- **Não é bug** — só nota pra corrigir docs futuras

### 🔵 P3 — order:ready é waiter-only
- `emitOrderReady` targets `tenant:<slug>:waiter` only
- Cook vê transição via generic `order:status` event mas não recebe `order:ready` específico
- Likely intentional (cook é quem marca ready), mas vale flag

### 🔵 P3 — "Configurações de som" em /eu é no-op
- Pushes /cozinha em vez de settings screen
- Header Som toggle é o único real control
- Mislabeled link

### 🔵 P3 — /eu stats placeholders
- PEDIDOS HOJE e TEMPO MÉDIO mostram `—`
- Não wirados ao backend (Onda 4 provável)

## WS test (verbatim)
```
CONNECTED: 03QINXqSCM78_H0YAAAR
EVT order:status: {"orderId":"abb40f71-...","status":"in_progress","timestamp":"2026-05-15T20:15:51.132Z"}
PATCH RESULT: {"orderId":"abb40f71-...","previousStatus":"received","newStatus":"in_progress"}

EVT order:status: {"orderId":"abb40f71-...","status":"ready","timestamp":"2026-05-15T20:16:09.650Z"}
PATCH1: {"orderId":"abb40f71-...","previousStatus":"in_progress","newStatus":"ready"}
```

Bare handshake (sem x-staff-key/x-staff-id) corretamente rejeitado:
- "Staff auth required for tenant rooms"
- /api/restaurant_dev/orders → 401 sem headers ✅

## DB cross-check
- KDS data = DB truth
- SELECT id, status FROM orders WHERE status NOT IN ('delivered','cancelled') → 8 rows
- UI mostrou same 8 cards (one mid-transition received→in_progress→ready)
- Defensive filter aceita canonical (received|in_progress|ready) + legacy aliases (open|confirmed|preparing) — intentional per P0-B-2 comment no source

## OK confirmados
- Auth correta server-side ✅
- WS emit pra rooms corretas ✅
- DB consistency ✅
- Som toggle visual state ✅
- Perfil navigation ✅

## Recomendações
1. Subscribe /cozinha ao WS room kitchen (eliminar 5s poll staleness)
2. Fix "Configurações de som" link (ir pra real settings ou remover)
3. Wire /eu stats (PEDIDOS HOJE, TEMPO MÉDIO) — Onda 4 provável

Tempo: ~17.4min (136073 tokens, 141 tool uses)
