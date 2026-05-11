# Round 15 — Bug-hunt FINAL (audit de fechamento pós-Round 15)

**Branch**: `claude/youthful-ptolemy-dd5fe0` (HEAD `e8d7768`, PR #39 mergeado)
**Calibração**: P0/P1 só pra vulnerabilidade NOVA, não-óbvia, com vetor concreto exploitable HOJE não coberta por trabalho prévio.
**Backlog deferred ignorado**: B-NEW-41/51/52/53/55/59/65, P3-NEW-1.

---

## Summary

| Severidade | Count | Notas |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 0 (novos) | — |
| P3 | 0 (novos) | — |

## Statement final

**LOOP ENCERRADO** · zero P0/P1 novos. Backlog P2/P3 vira issues separadas pra próximas sprints. Total: 15 rounds, 12 PRs mergeados, ~74 categorias fechadas.

---

## Verificação de fechamento do P1 do Round 14

### P1-NEW-1 (round14) → FECHADO em PR #39 ✓

`apps/api/src/modules/websocket/events.gateway.ts`

- **Linhas 91-136**: `validateCustomerInTenant(customerId, staffTenantSlug)` helper novo:
  - regex UUID-shape contra customerId (linha 104).
  - Cache positivo Redis `customer_tenant:<id>` TTL 5min (linha 108-111, 128-132) — evita lookup DB a cada join.
  - Lookup `public.restaurants WHERE slug = $1 AND is_active = true` resolve `schema_name` (linha 113-118).
  - Validação regex schema_name contra `^[a-z_][a-z0-9_]{0,62}$` (linha 120) — defense-in-depth contra schema-name SQL injection.
  - `SELECT 1 FROM "<schema>".customers WHERE id = $1 LIMIT 1` (linha 122-125) — tenant-scoped existence check.
- **Linhas 339-380**: `handleJoinCustomer` staff-path agora exige `staffTenantSlug` presente E call ao `validateCustomerInTenant`. Rejeita com `'Cross-tenant customer join blocked.'` se mismatch.

**Vetor que estava aberto** (round 14 audit): staff legítimo de tenant A com STAFF_API_KEY shared emitia `join:customer { customerId: <uuid-de-tenant-B> }` → entrava na room → recebia `complaint.responded` / `lgpd.request_fulfilled` / `late_arrival.*` / `staff_message.received` com PII de cliente alheio. **Agora bloqueado**.

### Cobertura completa pós-Round 15

WS gateway com 4 paths cobertos:
- `join:tenant` → cross-tenant rejected via `staffTenantSlug` check (round 9 + round 14 reforço).
- `join:session` → cross-tenant rejected via Redis session lookup + schemaName match (round 9 + round 14).
- `join:staff` / `join:manager` → exige `staffId` carimbado E mismatch reject (round 9).
- `join:customer` → staff-path agora cross-tenant lookup obrigatório (round 15). ✓

Customer-side `join:customer` continua falha-silenciosa (B-NEW-65 P2 deferred — fallback REST disponível, não é vetor de leak).

---

## Áreas re-auditadas neste round (sweep de fechamento)

### Controllers (28) · todos com guards/ownership consistentes

| Controller | Guards e ownership |
|---|---|
| `app.controller.ts` | health-only, sem dados |
| `assistant.controller.ts` | SessionGuard + cookie ownership (round 11) |
| `chat-history.controller.ts` | SessionGuard + cookie ownership (round 5) |
| `complaints.controller.ts` | Mix · create=Session+cookie / respond/forward=Manager+staffId / resolve=Staff+activeStaffId / list=Staff (round 7-13) |
| `customers.controller.ts` | identify rate-limit (round 6) · welcome rate-limit (round 9) · markVip/unmarkVip Manager (round 10) |
| `dashboard.controller.ts` | StaffOnly classe-level (round 7) |
| `deliveries.controller.ts` | StaffOnly classe-level (round 7) |
| `feedbacks.controller.ts` | SessionGuard + cookie (round 8) + service ownership (round 5) |
| `home.controller.ts` | SessionGuard + cookie (round 12) |
| `host.controller.ts` | StaffOnly+HostOrManager classe-level + requireStaffId em mutações (round 11) |
| `late-arrival.controller.ts` | SessionGuard + host check + tableSessionId pinned (round 6+11) |
| `lgpd.controller.ts` | SessionGuard + cookie (round 7) · list=StaffOnly read-only (round 12 deferred) |
| `menu.controller.ts` | SessionGuard global |
| `order-ratings.controller.ts` | SessionGuard + cookie + service tableSessionId scope (round 8+10) |
| `orders.controller.ts` | SessionGuard/StaffOrSession + actorType branch (round 7) + SETNX (round 10) |
| `payments.controller.ts` | SessionGuard + service tableSessionId ownership + SETNX (round 11) |
| `promotions.controller.ts` | Get pública (intencional, customer vê) · mutações StaffOnly (round 5) |
| `qr-issues.controller.ts` | stub returning [] (não vaza dados) |
| `settings.controller.ts` | `/public` endpoint intencional (branding) |
| `staff-messages.controller.ts` | StaffOnly + requireActiveStaffId + thread membership (round 13+14) |
| `staff-table-merge.controller.ts` | StaffOnly+ManagerOnly classe-level + requireStaffId (round 10) |
| `staff.controller.ts` | list/getById intentional (login flow) · mutações StaffOnly (round 7) · verify-pin throttle Redis IP+staffId (round 8) |
| `table-merge.controller.ts` | SessionGuard + sourceTableSessionId pinned + host check approve+reject (round 12+14) |
| `table-session.controller.ts` | `/init` HMAC validated (intentional public) |
| `table.controller.ts` | SessionGuard + cookie (round 12) |
| `vip.controller.ts` | StaffOnly+ManagerOnly em mutações (round 7) + StaffOnly em list (round 7) |
| `waiter-calls.controller.ts` | SessionGuard + cookie + service ownership + Staff em ack/resolve (round 8) |
| `zone-pause.controller.ts` | StaffOnly+ManagerOnly + requireStaffId (round 10) |

### Services · ownership/scope tight

- `orders.service` — tableSessionId scoping em getOrderById/cancelOrder/updateStatus (round 7) + SETNX createOrder (round 10) + sweepAutoConfirm benigno (apenas auto_confirm_at <= now)
- `payments.service` — tableSessionId ownership getPaymentStatus (round 11) + SETNX scope lock requestPayment
- `feedbacks.service` — JOIN visits ON table_session filtra por mesa atual (round 5)
- `order-ratings.service` — JOIN orders por tableSessionId (round 10)
- `waiter-calls.service` — call.table_session_id scope em getCall/cancelCall
- `complaints.service` — manager assignment + escalation atribuição via callerResolver
- `table-merge.service` — host check approve (linha 204-215) + reject (round 14)
- `late-arrival.service` — host check em isCallerHostOfRequest (round 6)
- `host.service` — todas queries via tenantConn (search_path scoped); body.staffId override pelo controller spread (`{...body, staffId}`)
- `vip.service` — flags por tableSessionId tenant-scoped
- `staff-messages.service` — thread membership checked send+listMessages+markRead (round 13+14)
- `chat-history.service` — listMessagesForCustomer filtra por customerId (round 5)
- `lgpd.service` — kind+customerId derivado do cookie (round 7)
- `assistant.service` — IDOR check em customer participants (round 11)
- `home.service` — customerId opt do cookie (round 12)
- `deliveries.service` — INSERT atômico com unique constraint (round 5); audit `'garcom'` hardcoded fica como P3-NEW-1 backlog
- `table-session.service` — decideJoinRequest + upsertParticipant validação host_customer_id

### WS Gateway (round 15 estado final)

- handshake staff: `x-staff-id` + `x-tenant-slug` MANDATORY (round 9+14)
- handshake session: token Redis valid required
- `join:tenant`: cross-check staffTenantSlug obrigatório (round 9+14)
- `join:session`: cross-tenant session lookup pra staff + schemaName match (round 9+14)
- `join:staff` / `join:manager`: requirestaffId match (round 9)
- **`join:customer`**: staff path agora valida customerId pertence ao tenant (round 15) ✓
- Emit helpers: todos scoped por slug/session/customer/staff/manager rooms
- DataSource injetado direto (mesmo pattern de ttl-tick.service e tenant.middleware) — TypeORM DI global

### AI service (re-auditado)

- Middleware `X-AI-Service-Key` fail-CLOSE em prod (round 9)
- Tools registry: customer-facing schemas advertised; staff_* tools NÃO no advertised set
- `make_http_api_client`: NÃO encaminha `x-staff-key` nem `x-session-token`, então mesmo se LLM chamar staff tool customer-side → apps/api retorna 403/404 (defense in depth)
- `dispatch_tool`: valida text obrigatório pra staff tools, mas confia em `is_staff` flag do request
- `apps/api` NUNCA chama `/tools/dispatch` (apenas `/chat`) — `is_staff` sempre False no path customer-facing

### Migrations (idempotência verificada)

- 037 (table_merge_cooldown_directional): idempotente via `DO $$ ... IF NOT EXISTS` (round 8 fix)
- 038 (order_deliveries_active_unique): `CREATE UNIQUE INDEX IF NOT EXISTS`
- 039 (drop_table_sessions_session_token): `DROP COLUMN IF EXISTS`
- Outras migrations recentes: revisadas em rounds anteriores

### Race conditions / idempotency (re-validated)

- `orders.createOrder`: SETNX lock por (table_session_id, idempotencyKey) (round 11)
- `payments.requestPayment`: SETNX lock por scope (round 11)
- `deliveries.claimOrder`: INSERT + UNIQUE catch 23505 (round 5)
- `waiter-calls.acknowledgeCall`: UPDATE atômico WHERE status='pending' RETURNING (round 5)
- `complaints.create`: idempotency em layer service
- `complaints.resolve`: CAS WHERE status NOT IN ('closed', 'resolved') (round 5)
- B-NEW-51 (feedbacks/complaints idempotency adicional): P2 deferred

### Caller resolver / DTO ownership (re-validated)

- `requireCustomerId(req)` extrai do cookie `recognition_token` apenas; ignora dto.customerId (rounds 8-12)
- `requireStaffId(req)` extrai do header `x-staff-id` (UUID v4 sanitized); ignora dto.staffId (round 10)
- `requireActiveStaffId(req)` faz cross-check DB `is_active=true` (round 11)
- Pattern `{...body, staffId}` em controllers garante override do mass-assignment de body.staffId (host module em particular)

---

## Achados negativos (verificados sem ser P0/P1)

### Anti-P1: lgpd.list (StaffOnly, retorna customer_cpf)

`apps/api/src/modules/lgpd/lgpd.controller.ts:123-127` — `GET /:slug/lgpd-requests` exposto a qualquer staff (waiter/cook), retorna `customer_cpf` no full DTO. Round 12 audit explicitamente classificou esta categoria como "read-only, sem audit relevante" e aceitou. Reclassificar como P1 agora seria contradizer calibração explícita do round anterior — **não-conforme com regra de fechamento** (não cobrir de novo família já tratada). Backlog de hardening: gate em ManagerOnlyGuard se compliance LGPD apertar (P2).

### Anti-P1: staff.list (público, retorna nomes + roles)

`apps/api/src/modules/staff/staff.controller.ts:84-88` — `GET /:slug/staff` sem guard. Documentado como intentional pra login flow (customer escolhe nome do garçom no PIN-step). PIN hash NÃO retornado (linha 54 do service: `SELECT id, name, role, is_active, created_at, updated_at`). Consistente com a regra "intentional, login bootstrap".

### Anti-P1: orders._sweep-auto-confirm (StaffOrSession)

`apps/api/src/modules/orders/orders.controller.ts:297-302` — endpoint protegido por `StaffOrSessionGuard`. Customer com session válida pode trigar sweep, mas serviço só promove orders cujo `auto_confirm_at <= now()` — apenas orders cuja janela 15s JÁ EXPIROU. Não há bypass de janela de cancelamento. Acceptable per design (round 4 docstring).

### Anti-P1: AI tools customer-callable

Tools com `audience="staff"` registradas no registry. `dispatch_tool` valida `requires_text` mas confia no `ctx.is_staff`. Apps/api SEMPRE chama `/chat` (não `/tools/dispatch`) com `is_staff=false`. Mesmo que LLM emita tool_call pra staff tool, o `make_http_api_client` NÃO inclui `x-staff-key` → apps/api 403 → defense in depth. Auditado, sem vetor exploitable.

---

## Backlog (P2/P3) consolidado · vira issues separadas

| ID | Sev | Área | Resumo |
|---|---|---|---|
| B-NEW-41 | P2 | DB | pool size config + remove query logging em prod |
| B-NEW-51 | P2 | feedbacks/complaints | idempotency adicional |
| B-NEW-52 | P2 | menu/search | rate-limit + cap query length |
| B-NEW-53 | P2 | parsing | JSON.parse defense em 4 hot paths |
| B-NEW-55 | P3 | WS | handshake rate-limit |
| B-NEW-59 | — | tests | coverage gaps (test_chips_coverage etc) |
| B-NEW-65 | P2 | WS | join:customer customer-side falha silenciosa (fallback REST OK) |
| P3-NEW-1 | P3 | deliveries | audit attribution `'garcom'` hardcoded |
| LGPD-list-hardening | P2 | LGPD | gate `lgpd.list` em ManagerOnlyGuard pra não vazar customerCpf pra waiter |

Recomendação: criar issues separadas no GitHub pra cada item, taggar `tech-debt` / `compliance` / `performance`. Loop autônomo encerra aqui.

---

## Resumo executivo dos rounds 4-15 (1 parágrafo)

Em 12 rounds (PRs #28-#39), o codebase fechou sistematicamente as classes de vulnerabilidade que afetam SaaS multi-tenant: (1) **DTO mass-assignment** — substituído body.customerId/staffId arbitrários por extração de cookie `recognition_token` e header `x-staff-id` via `CallerResolverService`, com variante `requireActiveStaffId` que cross-checa DB; (2) **WS auth hardening** — handshake staff EXIGE `x-staff-id` + `x-tenant-slug` non-empty, e os 4 paths `join:tenant/session/staff/customer` rejeitam cross-tenant subscription via `staffTenantSlug` match + customer existence cross-check em DB com cache Redis (round 15); (3) **Guards layering** — `StaffOnlyGuard` (env shared) + `ManagerOnlyGuard` (DB role lookup) + `HostOrManagerGuard` aplicados em todos endpoints de mutação cross-cutting (manager-only operations, host operations, staff messaging IDOR closure); (4) **Idempotency** — SETNX Redis em orders.create + payments.request, UNIQUE constraint em order_deliveries, CAS guard em complaint.resolve; (5) **Cookie security** — httpOnly + secure (NODE_ENV=production) + sameSite=lax em session_token + recognition_token; (6) **Rate limiting** — IP-based throttle em customer/identify, customer/welcome, staff/verify-pin (global IP além de per-staffId); (7) **AI service** — fail-CLOSE em prod sem AI_SERVICE_API_KEY; defense-in-depth via api_client sem auth headers (chamadas pra staff tools de dentro de chat customer 403am no apps/api); (8) **Migration runner** — todas migrations idempotentes via `DO $$ ... IF NOT EXISTS` ou `CREATE ... IF NOT EXISTS`. O loop chega a zero P0/P1 novos com backlog P2/P3 documentado pra próximas sprints.

---

## Conclusão

**LOOP ENCERRADO.** Zero P0 + zero P1 novos identificados pós-Round 15. PR #39 fechou o último P1 residual (P1-NEW-1 do round 14). Backlog P2/P3 (9 itens) consolidado acima vira issues separadas. Total: 15 rounds executados, 12 PRs mergeados, ~74 categorias de bug fechadas (rounds 3-15). Recomendação final: criar GitHub issues pra cada item do backlog tagged `tech-debt`/`compliance`/`performance`/`coverage` e fechar o ciclo de auditoria autônoma.
