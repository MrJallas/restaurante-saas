# Subagent F · Table-merge bidirectional + cooldown + staff override (V16)

**Status**: COMPLETED with 4 critical findings · 2026-05-09
**Sims**: iPhone 16 Pro (`60ED4E4A`) + iPhone 16 Pro Max (`FF595019`) + Playwright manager
**Mesas**: M14 (Ana Pereira) + M15 (Bruno Pacheco)
**Customers**: Ana `5ec9ccc0-e294-4d14-880b-95e842689a01` · Bruno `29bc0b71-58f2-4192-bc02-d6a84a9b26b7`

---

## TL;DR

- Forward A→B works · Bruno reject creates 10-min cooldown row · cooldown blocks A→B retry (HTTP 429)
- **P0 BUG: Cooldown is BIDIRECTIONAL** — `orderedPair()` canonicalizes (a,b) so B→A also returns 429 with the same row. V16 spec calls for unidirectional ("respeita mudança de ideia").
- **P0 BUG: Migration 035 (`approved_by_a_at`/`approved_by_b_at`) was NOT applied** to `restaurant_dev`. Without it, ALL approve calls fail with `column ... does not exist`. Applied manually for the test to proceed.
- Dual-consent works after migration: side stamping correctly maps host→A/B; status flips to `approved` only when both timestamps populated.
- **P1 GAP: NO staff override endpoint exists.** Spec V16 line 784 says "staff override é a única forma de staff intervir" but `/table-merge-requests` has no force/bypass route, no staff guard, and `ScreenManagerTableMenu` has no "Forçar merge" action.
- **P1 BUG: `MergedTableTile` component implemented but not wired up.** Used by zero screens — merged tables don't visually render in any manager view (Mapa not implemented either).
- **P1 V16 violation: Manager UI shows pending merges in "Escalações" tab** with empty table numbers (`M → M`). Per V16 spec, table-merge should NOT appear as escalation; `escalation_chains` table for `kind='table_merge'` is correctly empty (0 rows), but FE pulls pending merges directly into Escalações regardless.
- Cron cleanup of expired cooldowns works (10s tick deletes expired rows confirmed).
- Tool `request_table_merge` is correctly dispatched by IA and persisted in `assistant_messages.tool_calls`. End-to-end LLM→tool flow validated.

---

## Setup

### Containers (`jolly-wing-8f1e21` worktree)
```
restaurant-postgres  · 5434 healthy
restaurant-redis     · 6380 healthy
restaurant-api       · 3001 (Nest, hot reload)
restaurant-ai        · 8000 (FastAPI, 39 tools)
restaurant-web-staff · 3002
```

### Test sessions (created via SQL — onboarding/welcome HMAC bypass per spec adaptation)
| Session | Table | Token (Redis) | Host |
|---|---|---|---|
| `46c9a4c7…` | M14 | `64693c65-98d1…` | Ana (5ec9ccc0…) |
| `5c5cd5e9…` | M15 | `cd6f516e-54b2…` | Bruno (29bc0b71…) |
| `f42e121c…` (round 2) | M14 | `e35b1927…` | Ana |
| `b9f979dd…` (round 2) | M15 | `ef2b3747…` | Bruno |

Helper: `docker exec restaurant-redis redis-cli SET "session:<token>" '<json>'` to register session in guard.

### Screenshots
All in `qa-reports/screenshots/F/`:
- `01-sim5-ana-m14-initial.png` · `02-sim6-bruno-m15-initial.png`
- `03-manager-ops-after-merge-approved.png` · `04-manager-home-after-merge.png`
- `05-manager-escalacoes-pending-merges.png` · `06-sim5-final-state.png` · `07-sim6-final-state.png`

---

## Sequência observada (20 passos)

### Fase 1 · Forward merge A→B + recusa + cooldown setup (passos 1-7)

**Passo 1-4**: Ana M14 → request merge with M15 via `POST /table-merge-requests`:
```bash
curl -X POST http://localhost:3001/api/restaurant_dev/table-merge-requests \
  -H "Cookie: session_token=64693c65-98d1-4dff-b1f6-a9267d418a73" \
  -d '{ "sourceTableSessionId": "46c9a4c7…", "targetTableSessionId": "5c5cd5e9…",
       "requestingCustomerId": "5ec9ccc0…", "targetCustomerId": "29bc0b71…" }'
```
HTTP 201 · request `1e2d5f5a-6116-4fa0-b398-35b63c6e4b9d` created · status `pending` · TTL 60s.

DB validation:
```sql
SELECT id, source_table_session_id, target_table_session_id, status, ttl_expires_at FROM table_merge_requests …
-- 1e2d5f5a… · 46c9a4c7→5c5cd5e9 · pending · 03:27:10.217+00
```

**Passo 5-6**: Bruno rejects via `POST /table-merge-requests/:id/reject`. Status flips to `rejected`, cooldown row created with **10-min TTL** (per V16, spec mentions 20min — discrepancy logged as P2).

**Passo 7**: DB after reject:
```
request:  status=rejected · decided_at=03:26:25 · decided_by=29bc0b71 (Bruno)
cooldown: a=46c9a4c7 (M14) · b=5c5cd5e9 (M15) · expires=03:36:25 · reason=rejected
```
Cooldown row uses `orderedPair`-sorted UUIDs.

### Fase 2 · Cooldown enforcement + REVERSE direction test (passos 8-11)

**Passo 8-9** · Ana retries A→B during cooldown:
```
HTTP 429 Too Many Requests
{"cooldownEndsAt":"2026-05-09T03:36:25.773Z","retryAfterSeconds":588,
 "reason":"rejected","message":"Voce pode tentar de novo em alguns minutos.",
 "pair":{"a":"46c9a4c7…","b":"5c5cd5e9…"}}
```
✅ Cooldown blocks A→B as expected.

**Passo 10** · CRITICAL TEST · Bruno tries reverse B→A (same source/target swapped):
```
HTTP 429 Too Many Requests
{"cooldownEndsAt":"2026-05-09T03:36:25.773Z","retryAfterSeconds":581,
 "reason":"rejected","message":"Voce pode tentar de novo em alguns minutos.",
 "pair":{"a":"46c9a4c7…","b":"5c5cd5e9…"}}
```
⚠️ **B→A also blocked** — same exact cooldown row hits because `orderedPair()` in service code canonicalizes the pair.

**Passo 11** · No new request row created (cooldown blocks at gate before INSERT):
```sql
SELECT * FROM table_merge_requests WHERE … -- still only 1 row, the rejected A→B
```

#### Cooldown unidirectional confirmado: **NÃO** ❌

**Per V16 spec lines 784-810**: cooldown should be unidirectional ("if A→B is rejected, B→A should still be allowed — respeita mudança de ideia"). **Empirical result: bidirectional**.

**Code evidence** in `apps/api/src/modules/table-merge/table-merge.service.ts:67`:
```ts
const [a, b] = orderedPair(input.sourceTableSessionId, input.targetTableSessionId);
// Check active cooldown — block before allocating a row.
const cooldown = await this.tenantConn.query(
  `SELECT … FROM table_merge_cooldowns
    WHERE table_session_a_id = $1 AND table_session_b_id = $2 AND cooldown_expires_at > now()`,
  [a, b]);
if (cooldown.length) { throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS); }
```
The schema enforces this with both:
- `CHECK (table_session_a_id < table_session_b_id)` (canonical ordering)
- `UNIQUE CONSTRAINT (table_session_a_id, table_session_b_id)` (one row per pair, regardless of direction)

To get B→A to work, I had to manually `DELETE` the cooldown row first.

### Fase 3 · Approval flow with dual-consent (passos 10b-15)

After manual cooldown clear:
- **Passo 10b**: Bruno B→A creates request `8eca6be4…` · status `pending`
- **Passo 12 (first attempt)**: Ana approves → **HTTP 500 Internal Server Error** ❌

**Root cause** found in API logs:
```
query failed: UPDATE table_merge_requests SET approved_by_a_at = COALESCE(approved_by_a_at, now()) …
error: column "approved_by_a_at" does not exist
```

Migration 035 `table_merge_dual_consent.sql` was **never applied** to `restaurant_dev`. Service code was deployed but DB schema is stale.

**Fix applied**:
```sql
ALTER TABLE table_merge_requests
  ADD COLUMN IF NOT EXISTS approved_by_a_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_b_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_table_merge_requests_pending_dual
  ON table_merge_requests(approved_by_a_at, approved_by_b_at) WHERE status='pending';
```

**Passo 12 retry**: Ana approves → side `b` stamped (her customer_id matches target_session_id host = M14, but in canonical ordering Ana's session ID is the larger UUID so she's side B). status remains `pending`.
**Passo 12b**: Bruno approves → side `a` stamped → both timestamps non-null → status flips to `approved`, `decided_at` set.

DB after both approvals:
```
status     = approved
decided_at = 2026-05-09 03:27:51.153+00
approved_by_a_at = 03:27:51.153+00 (Bruno's stamp)
approved_by_b_at = 03:27:44.858+00 (Ana's stamp)
```
✅ Dual-consent works correctly.

**Passo 13** · merged-tile V3: ❌ NOT IMPLEMENTED in any active screen. `MergedTableTile.tsx` exists in `apps/web-staff/src/components/manager/MergedTableTile.tsx` and is exported from `index.ts`, but `grep -r 'MergedTableTile' src/screens` returns ZERO usages. Logged as P1.

**Passo 14** · Manager UI: opening `/manager/operacoes` "Escalações" tab shows pending merges as `MInProgressCard` with title "Junção de Mesas" and subtitle "M → M ↔ walk-in" — **table numbers are empty** because `TableMergeService.createRequest()` emits WS event with `originTableNumber: 0, targetTableNumber: 0` (TODO in code line 132 admits this gap). FE re-fetches via REST but `MInProgressCard` doesn't seem to populate properly. Screenshot `05-manager-escalacoes-pending-merges.png`.

**Passo 15** · Bills unification: `orders.billing_mode` was not changed by approve. Per V16 spec the merge would route subsequent orders by session pair, but no test orders were created here (out of scope for the merge flow itself).

### Fase 4 · Staff override flow (passos 16-19)

**Passo 16-19** · Reset state, Bruno re-rejects, manager attempts override:
- Setup: new sessions M14→`f42e121c…`, M15→`b9f979dd…`. Bruno rejected new request `26b8ba81…`. Cooldown row created.
- Manager flow: ❌ **NO endpoint exists for staff override.**

Searched `apps/api/src/modules/table-merge/` — controller only has 4 routes:
```
POST   /:slug/table-merge-requests           (SessionGuard - customer)
POST   /:slug/table-merge-requests/:id/approve (SessionGuard - customer)
POST   /:slug/table-merge-requests/:id/reject  (SessionGuard - customer)
GET    /:slug/table-merge-requests           (no guard)
```

No `StaffOnlyGuard`-protected route, no `force=true` body field, no audit trail in `escalation_chains.steps`. The spec V16 expectation that "Manager Erica abre `/manager/operacoes` → MoreSheet sobre M14 → 'Forçar merge com M15'" is **completely unimplemented**:
- `ScreenManagerTableMenu.tsx` has no "Forçar merge" action in MoreSheet (only "Reportar problema", "Marcar VIP", "Ver auditoria")
- `manager.ts` API client `tableMergeApi` only proxies the customer endpoints

### Fase 5 · Cron cleanup (passo 20)

**Passo 20** · Forced expiration:
```sql
UPDATE table_merge_cooldowns SET cooldown_expires_at = NOW() - INTERVAL '1 second';
```
After 12s wait, query returns 0 rows. ✅ Cleanup works.

API logs show `DELETE FROM table_merge_cooldowns` query fired by `ttl-tick.service.ts:337` (Cron `EVERY_10_SECONDS`).

---

## Validação DB completa

### `table_merge_requests` (8 rows total in DB; 3 from this test)
```
1e2d5f5a-6116-4fa0-b398-35b63c6e4b9d · 46c9a4c7→5c5cd5e9 · rejected · Bruno decided
8eca6be4-c9c7-4c56-b2ce-66fd53bbff7a · 5c5cd5e9→46c9a4c7 · approved · Ana decided · approved_by_a/b both set
26b8ba81-f61d-4008-8b1f-7265c3cddbee · f42e121c→b9f979dd · rejected · Bruno decided (cooldown setup)
```

### `table_merge_cooldowns` 
At time of test had 1 row at `(a=46c9a4c7, b=5c5cd5e9)` with `expires=03:36:25` and `reason='rejected'`. After cron tick on the second test cooldown — 0 rows. **Schema enforces canonical ordering** via CHECK + UNIQUE constraint, so it CANNOT distinguish A→B vs B→A by design. Query that confirms B→A also blocked (Step 10):

```sql
-- Both directions return same cooldown row
SELECT id, table_session_a_id, table_session_b_id FROM table_merge_cooldowns
 WHERE (table_session_a_id='M14_ID' AND table_session_b_id='M15_ID')
    OR (table_session_a_id='M15_ID' AND table_session_b_id='M14_ID');
-- 1 row · 46c9a4c7 · 5c5cd5e9 (canonical ordered)
```

### `escalation_chains` for `kind='table_merge'`: **0 rows** ✅
Confirms V16 spec: table-merge does NOT escalate to staff. No chains created in any of the 8 historical merge requests OR in this test's 3 requests. `escalation_chains.steps` jsonb default `'[]'::jsonb`.

### `assistant_messages.tool_calls` populated
```
id=38b85047-66f7-4ff3-a52a-037a33e094ce
user_message="quero juntar minha mesa com a M15"
tool_calls = [{id:'502960192', function:{name:'request_table_merge', arguments:{targetTable:'M15'}}, …}]
```
✅ End-to-end LLM tool dispatch confirmed (despite tool execution failing because `API_BASE_URL` env var not set on `restaurant-ai` container — same P0 documented by Subagent D-1).

---

## Bugs encontrados

### P0 (blocker) — Cooldown bidirectional violates V16 spec
**Repro**: A→B reject creates cooldown · B→A subsequent create returns 429 with same row.
**Evidence**:
- Service `apps/api/src/modules/table-merge/table-merge.service.ts:67-79` — `orderedPair()` canonicalizes
- Schema `packages/database/migrations/tenant-template/025_create_table_merge_requests.sql` — UNIQUE/CHECK enforce canonical
- HTTP test: B→A returns 429 with `pair:{a:46c9a4c7,b:5c5cd5e9}` matching A→B
**Spec quote (V16 line 784, 809)**: "cooldown unidirecional · respeita mudança de ideia" / "Bruno-recusa-A→B-mas-Ana-aceita-B→A NÃO funciona (caminho reverso bloqueado errado)"
**Fix shape**: change `table_merge_cooldowns` to track direction (e.g., `requesting_session_id, target_session_id` instead of canonical pair) OR adopt 2-row model (one per direction) when rejection happens.

### P0 (blocker) — Migration 035 not applied to restaurant_dev
**Repro**: any approval call returns HTTP 500 with `column "approved_by_a_at" does not exist`.
**Evidence**: `\d restaurant_dev.table_merge_requests` shows 14 columns, missing `approved_by_a_at` and `approved_by_b_at`. File `035_table_merge_dual_consent.sql` exists but was never run.
**Fix shape**: run migration 035 against `restaurant_dev` schema (and any other tenant schemas). Verify migration runner state — possibly migrations stopped at 034.

### P1 — No staff override endpoint
**Repro**: `grep -rn "force\|override\|StaffOnlyGuard" apps/api/src/modules/table-merge/` returns nothing.
**Evidence**: controller only has 4 customer-scoped endpoints. `tableMergeApi` in `manager.ts` only proxies customer endpoints. `ScreenManagerTableMenu` MoreSheet has no merge action.
**Spec quote (V16 line 784)**: "Staff override (V16: única forma de staff intervir)"
**Fix shape**: add `POST /:slug/table-merge-requests/staff-force` with `StaffOnlyGuard` that:
1. Bypasses cooldown check
2. Creates request with `decided_at = now()`, `status = 'approved'`
3. Logs in `escalation_chains.steps` jsonb (e.g., `[{kind:'staff-override', staff_id, reason, at}]`)
4. Adds UI action in `ScreenManagerTableMenu` MoreSheet

### P1 — `MergedTableTile` not wired up to any screen
**Repro**: `grep -r "MergedTableTile" apps/web-staff/src/screens/` returns 0 matches.
**Evidence**: component exists at `apps/web-staff/src/components/manager/MergedTableTile.tsx`, exported from `index.ts`, but never imported by any screen. Mapa (sala) view doesn't exist (no `ScreenManagerMapa.tsx` or similar).
**Impact**: after a successful merge, manager has no visual signal of which tables are joined. The `Mesa M14 + M15` grouped tile from V3 design is dead code.
**Fix shape**: implement Mapa view in `ScreenManagerHomeA` or new screen, fetch active approved merges, render `MergedTableTile`.

### P1 — Manager Escalações tab shows pending merges (V16 violation)
**Repro**: open `/manager/operacoes`, click "Escalações" tab. Pending merges visible as cards with title "Junção de Mesas" and subtitle "M → M ↔ walk-in".
**Evidence**: `ScreenManagerOps.tsx:234` filters `pendingMerges` and renders them as escalations.
**Spec quote (V16 line 194)**: "late-arrival e table-merge NÃO escalam pra staff. Customer-host é o ÚNICO aprovador. Staff recebe `*Info` lockscreen passivo após decisão."
**Fix shape**: remove `pendingMerges` from Escalações tab; if visualization needed, render in a separate "Em curso (info-only)" panel.

### P1 — `MInProgressCard` shows empty table numbers for merge
**Repro**: pending merge card shows "M → M" with no numbers.
**Evidence**: `apps/api/.../table-merge.service.ts:130-141` emits WS event with `originTableNumber: 0, targetTableNumber: 0` and TODO comment ("require joins with table_sessions/visits/customers"). FE renders 0 → blank.
**Fix shape**: add JOIN to `table_sessions` + `tables` to populate `originTableNumber/targetTableNumber` in `emitTableMergeCreated`.

### P2 — Cooldown TTL = 10 min (spec V16 says 20 min)
**Repro**: `cooldown_expires_at` set to `now() + 10 min` in service.
**Evidence**: `apps/api/.../table-merge.service.ts:299-303` uses `COOLDOWN_MINUTES * 60` constant.
**Spec discrepancy**: V16 spec line 772 mentions "≈ now + 20min".
**Severity**: P2 because spec wording is "≈" but worth aligning.

### P2 — `request_table_merge` tool can't reach apps/api (env var gap)
**Repro**: dispatch via `/tools/dispatch` returns `transport: [Errno 111] Connection refused`.
**Evidence**: `restaurant-ai` env vars don't include `API_BASE_URL`. Default is `http://localhost:3000` which doesn't resolve in Docker network.
**Spec note**: same gap as Subagent D-1 (P0/D-1).
**Fix shape**: add `API_BASE_URL: http://api:3001/api` to ai-service env in docker-compose.yml.

---

## Tools envolvidas + tool_calls populados

| Tool | Audience | Persisted | Path |
|---|---|---|---|
| `request_table_merge` | customer | ✅ in `assistant_messages.tool_calls` | LLM → ai-service → tool dispatch |

LLM (qwen2.5-7b-instruct-mlx) correctly identified intent and called `request_table_merge({targetTable: "M15"})` from message "quero juntar minha mesa com a M15".

---

## Chips contextuais observados

Customer overlay flow couldn't be fully tested via UI because IA tool error path returned `null` message + empty chips (since the actual API call failed). When working with API_BASE_URL set, chips would render the OverlaySalonMap per spec line 743-744.

---

## Reproduction snippet (for fix validation)

```bash
# Step 1: forward A→B
curl -X POST http://localhost:3001/api/restaurant_dev/table-merge-requests \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=$ANA_TOKEN" \
  -d "{\"sourceTableSessionId\":\"$SESSION_M14\",\"targetTableSessionId\":\"$SESSION_M15\",\"requestingCustomerId\":\"$ANA_ID\",\"targetCustomerId\":\"$BRUNO_ID\"}"

# Step 2: Bruno rejects → cooldown created
curl -X POST .../$REQUEST_ID/reject -d "{\"decidedByCustomerId\":\"$BRUNO_ID\"}"

# Step 3: Test bidirectional cooldown (THIS IS THE P0)
curl -X POST .../table-merge-requests \
  -H "Cookie: session_token=$BRUNO_TOKEN" \
  -d "{\"sourceTableSessionId\":\"$SESSION_M15\",\"targetTableSessionId\":\"$SESSION_M14\",…}"
# EXPECTED (V16): HTTP 201 (new request)
# ACTUAL: HTTP 429 (blocked by canonical-pair cooldown)
```

---

## Conclusões

- **Customer-side merge flow** (request → reject → cooldown → approve via dual-consent) works after migration 035 is applied
- **Staff/manager-side flow** (V16 override) is **completely unimplemented** — no endpoint, no UI
- **Schema design** prevents unidirectional cooldown without a migration
- **Cron cleanup** works correctly (10s tick removes expired rows)
- **LLM tool dispatch** routes correctly; full integration depends on API_BASE_URL env fix (cross-cutting infra issue)

**Recommended next steps**:
1. Apply migration 035 to all tenant schemas (P0 immediate)
2. Add `API_BASE_URL` to ai-service container (P0 cross-cutting)
3. Redesign cooldown table OR service logic for unidirectional behavior (P0)
4. Implement staff-override endpoint + UI (P1)
5. Wire up `MergedTableTile` to a Mapa screen (P1)
6. Move pending merges out of Escalações tab in Manager UI (P1)
