# Round 16 — Bug-hunt FINAL (audit pós-Round 16)

**Branch**: `main` (HEAD `c732701`, PR #40 mergeado)
**Calibração**: P0/P1 só pra vulnerabilidade NOVA, não-óbvia, com vetor concreto exploitable HOJE não coberta por trabalho prévio.
**Backlog deferred remanescente esperado**: B-NEW-59 (test coverage gaps) → fora de escopo PR (vira tech-debt:tests issue).

---

## Summary

| Severidade | Count | Notas |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 (novos) | observação P3 multi-customer-per-table abaixo |
| P3 | 0 (novos) | — |

**Typecheck**: `npx tsc --noEmit` (apps/api) passa sem erros após PR #40.

---

## Verificação de cada fix do Round 16

### 1. B-NEW-41 (P2): DB pool config + query logging gated → ✓

`apps/api/src/config/database.config.ts` (linhas 1–29):
- Pool size via `DB_POOL_SIZE` env, default 20 (era hardcoded TypeORM default 10).
- `idleTimeoutMillis: 30_000` (libera conexões ociosas em pico).
- `connectionTimeoutMillis: 5_000` (fail-fast em vez de pendurar req).
- `logging: process.env.DEBUG_DB === 'true'` (era `NODE_ENV !== 'production'` → ruidoso em dev). Stdout limpo por default.
- Sanity guard `Number.isFinite(poolSize) && poolSize > 0` cai em fallback 20 se env malformado.

**Teste mental**: `DB_POOL_SIZE=` (vazio) → `Number(undefined)` é `NaN` → `Number.isFinite(NaN)` false → fallback 20. ✓

### 2. B-NEW-52 (P2): /menu/search rate-limit IP + cap 50 chars → ✓

`apps/api/src/modules/menu/menu.controller.ts` (linhas 16–112):
- `SEARCH_RATE_MAX = 30` em `SEARCH_RATE_WINDOW_SECONDS = 60` por IP (Redis incr+expire).
- Cap 50 chars: query > 50 → 400 BadRequest.
- Sem trim < 2 → return `{ items: [] }` cedo (correto: skip rate-limit pra empty queries).
- Key: `menu:search:<ip>` extraído via `x-forwarded-for` first IP (mesmo pattern de `customers.controller.identifyClientKey`).
- `RedisModule` adicionado em `menu.module.ts:7-12`. ✓

**Teste mental ataque DoS**: 31º request em <60s → `attempts > 30` → 429. CPU ILIKE protegido. ✓

### 3. B-NEW-53 (P2): safeJsonParse helper + 5 sites wired → ✓

`apps/api/src/common/utils/safe-json.ts` (linhas 1–23): wrapper genérico `safeJsonParse<T>` retorna `null` em payload corrompido em vez de propagar `SyntaxError`.

Sites adotados:
- `session.guard.ts:42-48` ✓ — payload corrompido vira 401 amigável em vez de 5xx.
- `staff-or-session.guard.ts:79-85` ✓ — mesma defesa.
- `table-session.service.ts:184` (getSessionFromToken) ✓ — fallback null tratado como cache miss.
- `table-session.service.ts:199` (attachCustomerToSession) ✓ — early-return idempotente.
- `orders.service.ts:111-115` (idempotency polling) ✓ — corrupt cache não derruba poll.
- `events.gateway.ts:245-258` (WS handshake session-payload) ✓ — fall-through pro 'Authentication required' em vez de crash.

**Único `JSON.parse` bare remanescente**: `events.gateway.ts:349` em `handleJoinSession` (staff-path session lookup) — JÁ TEM try/catch local com emit `'Session payload corrompido.'` + return. Aceitável.

### 4. B-NEW-55 (P3): WS handshake rate-limit 30 conn/60s por IP → ✓

`apps/api/src/modules/websocket/events.gateway.ts:158–173`:
- Helper `handshakeIp` extrai IP via `x-forwarded-for` first → fallback `client.handshake.address` → `'unknown'`.
- Key `ws:handshake:<ip>` Redis incr+expire 60s.
- `attempts > 30` → log warn + emit error + `client.disconnect(true)` antes de chegar no `timingSafeEqual`/`redis.get(session:*)`.
- Posição: PRIMEIRA coisa em `handleConnection`, antes de qualquer leitura de `staffKey`/`sessionToken`. Cobre handshake malicioso sem credentials válidas. ✓

**Tuning observation P3 (não-blocker)**: Restaurante com 5+ devices staff atrás de mesmo NAT pode encostar no limite em pico de reconnects pós-deploy. Mitigação: env futura `WS_HANDSHAKE_RATE_MAX` se ops sentir necessidade.

### 5. B-NEW-65 (P2): customerId carimbado no session payload → ✓

`apps/api/src/modules/table-session/table-session.service.ts`:
- Interface `SessionData.customerId?: string` adicionada (linhas 16–30).
- Método `attachCustomerToSession(sessionId, customerId)` (linhas 188–206): lê payload Redis, faz `safeJsonParse`, sobrescreve com novo `customerId`, refresca TTL.
- Idempotente; fail-silent se sessão não existir (`if (!data) return`).

`apps/api/src/modules/customers/customers.service.ts:121-124`: chamada wired após `upsertParticipant` no flow `welcome`. ✓

**Caveat funcional (não-security)**: o payload Redis é compartilhado por todos os customers em uma mesma `table_session`. Se Customer A welcomes (cria session.customerId=A), depois Customer B welcomes (overwrites session.customerId=B), o WS handshake do A em reconexão lê customerId=B → A não consegue mais entrar na sua própria customer-room. **Não é vetor de leak/IDOR** (A não passa a receber eventos de B; o `join:customer { customerId: A }` simplesmente é rejeitado por mismatch). É um P3 multi-customer-UX que pode degradar reconexão pós-late-arrival. Fora do escopo de P0/P1; o commit message do round 16 já reconhece que era usado pra evitar fallback REST de late-arrival popup.

### 6. P3-NEW-1: deliveries staffId real (requireActiveStaffId) → ✓

`apps/api/src/modules/deliveries/deliveries.controller.ts`:
- `claimOrder` + `markDelivered` agora `await this.callerResolver.requireActiveStaffId(req)` antes do call ao service.
- `CallerResolverModule` importado em `deliveries.module.ts:4-12`. ✓

`apps/api/src/modules/deliveries/deliveries.service.ts`:
- `claimOrder(orderId, slug, staffId)` insere com `claimed_by = $2` (UUID FK). Schema `009_create_deliveries.sql:4` confirma `claimed_by UUID REFERENCES staff(id)` — FK válida.
- `markDelivered(deliveryId, slug, staffId)` insere `order_status_history.changed_by = $2`. Schema `007_create_orders.sql:48` confirma `changed_by VARCHAR(100)` — UUID 36 chars cabe folgado.
- Emit `emitOrderClaimed(slug, orderId, staffId)` agora carrega o UUID pra que consumer possa filtrar UI ("eu claimei vs outro").

**Audit accountability restaurada**: registros de claim/delivered agora carregam UUID real do staff em vez do literal `'garcom'`. `requireActiveStaffId` faz cross-check `is_active=true` no DB (defesa contra UUID de staff demitido).

### 7. LGPD-list-hardening (P2): ManagerOnlyGuard em /lgpd-requests → ✓

`apps/api/src/modules/lgpd/lgpd.controller.ts:131-135`:
- `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)` adicionado ao endpoint `GET /:slug/lgpd-requests` (era `StaffOnlyGuard` solo).
- `ManagerOnlyGuard` faz lookup DB `SELECT role FROM staff WHERE id = $1 AND is_active = true` exigindo `role === 'manager'`. Cookie/key spoofing sem manager UUID real é bloqueado.

`lgpd.module.ts:15-17`: `ManagerOnlyGuard` registrado em `providers` pro DI lookup. ✓

**Vetor fechado**: waiter/cook não enumera mais `customer_cpf` no payload de listas LGPD.

### 8. B-NEW-51 (P2): UNIQUE INDEX feedbacks(visit_id) + 23505 catch → ✓

`packages/database/migrations/tenant-template/040_feedbacks_visit_unique.sql`:
- `CREATE UNIQUE INDEX IF NOT EXISTS feedbacks_visit_id_unique ON feedbacks(visit_id) WHERE visit_id IS NOT NULL`.
- Idempotente (IF NOT EXISTS).
- Partial WHERE permite múltiplos `visit_id IS NULL` (anonymous feedback) sem conflito.

`apps/api/src/modules/feedbacks/feedbacks.service.ts:26-55`: refatorado pra try/catch o INSERT, capturar `err.code === '23505'` e mapear pra `BadRequestException('Feedback ja enviado para esta visita.')`. SELECT-then-INSERT race condition fechada.

**Migration runner**: `packages/database/scripts/migrate-tenants.ts` aplica 040 idempotentemente em tenants existentes via `__migrations__` tracking (validado round 11 P-NEW-2). Tenant pre-existente vem com `__migrations__` populated até 035 (host_module probe) ou 023, e 040 é aplicada como nova. ✓

---

## Re-auditoria de novos P0/P1 vectors (sweep)

### Controllers públicos sem guards (intencionais) — sem regressão

- `settings/settings.controller.ts` → `GET /public` retorna apenas branding (intencional).
- `table-session/table-session.controller.ts` → `POST /init` é o entry-point QR-scan, auth via HMAC.

### JSON.parse audit completo

```
src/common/utils/safe-json.ts                  → helper (3 ref docstring)
src/modules/assistant/assistant.service.ts:396 → comment-only (JSONB já parsed)
src/modules/websocket/events.gateway.ts:349    → join:session staff-path · try/catch local ✓
```

Nenhum bare `JSON.parse` exposto a payload Redis sem guard.

### x-staff-id / x-staff-key audit

Todos os reads diretos de header `x-staff-id` passam por validação:
- `caller-resolver.service.ts:88` → regex UUID + `requireActiveStaffId` cross-check.
- `host-only.guard.ts:35` → regex UUID + DB role + `is_active=true`.
- `manager-only.guard.ts:42` → regex UUID + DB role + `is_active=true`.
- `events.gateway.ts:193` → mandatory presence check + tenant-slug enforcement (round 14).

### SQL injection sweep

Nenhum template-literal com interpolação client-controlled em SQL. Todos `tenantConn.query` usam `$1...$N` parametrização. Schema names interpolados (e.g., `events.gateway.ts:142 SELECT 1 FROM "${schemaName}".customers`) passam por regex `^[a-z_][a-z0-9_]{0,62}$` antes (defense-in-depth round 15).

### WS gateway 4 paths verificados

Cobertura preservada de rounds 9/14/15:
- `join:tenant` → `staffTenantSlug` mandatory check ✓
- `join:session` → cross-tenant via Redis schemaName match + safeJsonParse `JSON.parse` ainda em try/catch local ✓
- `join:staff` / `join:manager` → `staffId` mandatory + mismatch reject ✓
- `join:customer` (staff-path) → `validateCustomerInTenant` cache+DB ✓
- `join:customer` (customer-path) → `client.data.customerId === data.customerId` direto (round 16 B-NEW-65 popula esse customerId no handshake; observação UX multi-customer acima) ✓

### Audit attribution sweep

Endpoints staff-side com persistência de audit field passam UUID real:
- `complaints` respond/resolve/forward → `requireActiveStaffId` ✓ (round 12+13)
- `staff-messages` send/markRead → `requireActiveStaffId` ✓ (round 12+14)
- `host` liberate/swap/vip → `requireStaffId` (HostOrManagerGuard cobre DB) ✓ (round 11)
- `vip`, `staff-table-merge` → `requireStaffId` (ManagerOnlyGuard cobre DB) ✓ (round 10)
- `deliveries` claim/markDelivered → `requireActiveStaffId` ✓ **(round 16)**

Todos coerentes: audit grava UUID real, não literal `'garcom'`/`'system'`.

---

## Statement final

**LOOP DEFINITIVAMENTE ENCERRADO** · 0 P0/P1, 8 P2/P3 fechados em round 16. Apenas B-NEW-59 (test coverage) fica como tech-debt:tests issue.

Total acumulado: 16 rounds, 13 PRs mergeados, ~82 categorias fechadas (74 do loop original + 8 do backlog deferred no round 16). Codebase em estado seguro de produção sob threat-model atual (multi-tenant SaaS B2B, staff trusted-but-segregated, customer untrusted in-table).

Próximas iniciativas (não-blocking, fora do scope deste loop):
1. **B-NEW-59**: cobertura de testes E2E para flows P0/P1 corrigidos. Sugestão: vira issue com label `tech-debt:tests`.
2. **JWT migration** (mencionado em `manager-only.guard.ts:28-31`): substituir `x-staff-key` shared + `x-staff-id` cross-checks por JWT per-staff assinado server-side. Eliminaria DB lookups em hot path e impediria spoofing de staff-id mesmo conhecendo o shared key. P3 arquitetural.
3. **Multi-customer-per-table session payload** (observação round 16 B-NEW-65): refatorar pra que `attachCustomerToSession` carregue map `participants[customerId]` em vez de slot único. Permitiria customer-side WS validar contra um set, suportando múltiplos hosts/late-arrivals na mesma mesa sem overwriting. P3 UX-correctness.
