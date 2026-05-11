# Round 14 — Bug-hunt (audit final pós-Round 14)

**Branch**: `claude/youthful-ptolemy-dd5fe0` (HEAD `028a78e`)
**Calibração**: P0/P1 só pra vulnerabilidade **NOVA** + vetor concreto exploitable hoje.
**Backlog deferred ignorado**: B-NEW-41/51/52/53/55/59/65, P3-NEW-1.

---

## Summary

| Severidade | Count | Notas |
|---|---|---|
| P0 | 0 | — |
| P1 | 1 | WS `join:customer` staff-path sem cross-tenant lookup (resíduo do round 13 não fechado pelo round 14) |
| P2 | 0 (novos) | — |
| P3 | 0 (novos) | — |

## Statement final

**NÃO ENCERRA — 1 P1 ativo.**

Justificativa explícita de por que esse P1 não é cobertura redundante:

- Round 13 audit (qa-reports/round13-bug-hunt.md, linhas 100-103 e 132-134) **identificou** três paths de WS gateway com gap cross-tenant: `join:tenant`, `join:session` e `join:customer` staff-path. O fix proposto pra todos os três era (a) handshake EXIGE `x-tenant-slug` + (b) **adicionar tenant lookup em `join:customer` staff path**.
- Round 14 PR #38 fechou (a), `join:tenant` e `join:session` — mas o staff path em `join:customer` (events.gateway.ts:293-298) continua sem cross-check de tenant. A docstring atualizada em events.gateway.ts:179-199 lista os 4 fixes do round 9/14 mas omite explicitamente `join:customer`.
- O fix `x-tenant-slug` mandatório (round 14) **não** mitiga isso por si só: staff legítimo do tenant A (com `staffTenantSlug = 'restaurante-a'` carimbado) ainda emite `join:customer { customerId: <bId-de-tenant-B> }` e entra na room sem qualquer validação. O gateway aceita o join (linha 293: `if (client.data.authType === 'staff') { client.join(...); return; }`).
- Vetor concreto hoje exploitable abaixo. Como não foi ativamente coberto pelo PR #38 (handshake-only) e como é resíduo direto de uma recomendação Round 13 não implementada, classificação P1 mantém.

---

## Top finding

### P1-NEW-1 — WS `join:customer` staff-path sem cross-tenant validation

**File**: `apps/api/src/modules/websocket/events.gateway.ts:288-309`

```ts
@SubscribeMessage('join:customer')
handleJoinCustomer(
  @ConnectedSocket() client: AuthedSocket,
  @MessageBody() data: { customerId: string },
) {
  if (client.data.authType === 'staff') {
    client.join(`customer:${data.customerId}`);   // ← no tenant check
    this.logger.log(
      `Staff ${client.id} joined customer room ${data.customerId}`,
    );
    return;
  }
  // session path: validates client.data.customerId === data.customerId (OK)
  ...
}
```

**Vetor concreto**:

1. Atacante tem acesso ao `STAFF_API_KEY` (env shared deployment-global; per `staff-only.guard.ts:18` é único e não tem tenant scoping).
2. Atacante abre WS handshake passando seu próprio tenant slug (round 14 garante presença de `x-tenant-slug`):
   ```js
   io(WS_URL, {
     auth: {
       staffKey: STAFF_API_KEY,
       staffId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
       tenantSlug: 'restaurante-a',  // tenant legítimo do atacante
     },
   })
   ```
3. Após `connect`, emite `join:customer { customerId: '<aliceId-do-tenant-B>' }` (UUID do customer Alice em outro tenant).
4. Gateway aceita (linha 294: `client.join('customer:<aliceId>')`), pois `authType === 'staff'` e nenhum check de tenant.
5. Tenant B emite eventos `customer:<aliceId>` via:
   - `emitComplaintResponded` (events.gateway.ts:733) — texto da resposta do manager
   - `emitComplaintResolved` (events.gateway.ts:760) — payload com customer name/visit info
   - `emitLgpdRequestFulfilled` (events.gateway.ts:676) — protocol number, customer ID
   - `emitLateArrivalCreated/Approved/Rejected/Expired` (events.gateway.ts:523-577) — message text, requester name, table number
   - `emitTableMergeCreated` (events.gateway.ts:593-598) — origin/target session details
   - `emitEscalationCompleted` (events.gateway.ts:506) — completion payload
   - `emitStaffMessageReceived` (events.gateway.ts:776) — DM text
6. Atacante recebe TODOS esses payloads PII alheios sem disparar log/auditoria de cross-tenant.

**Pré-requisitos pra exploit**:

- `STAFF_API_KEY` (compartilhada, mas qualquer staff de QUALQUER tenant tem). Vetor interno: ex-funcionário, staff ainda ativo querendo bisbilhotar tenant vizinho operado pela mesma empresa SaaS.
- Conhecimento do `customerId` (UUID v4) de um cliente em OUTRO tenant. Vetores realistas:
  - logs de aplicação que vazaram (Round 8 mitigou alguns mas histórico em SIEM/CDN access logs ainda).
  - dump Mongo (chat-history) parcialmente vazado.
  - staff que migrou de tenant — UUIDs que viu antes.
  - colisão de `customerId` em integrações cross-tenant (rare mas possível).

**Por que NÃO é mitigado pelo round 14**:

O fix de `x-tenant-slug` mandatório (linha 134-144) garante apenas que `client.data.staffTenantSlug` está presente. Os checks downstream em `join:tenant` (linha 216-222) e `join:session` (linha 263-269) usam `staffTenantSlug` pra rejeitar slug/sessionId de outro tenant. Mas `join:customer` simplesmente não compara nada — staff path é `client.join` direto.

**Round 13 audit explicitamente recomendou**:
> "remover o `if (... &&)` conditional dos guards `join:tenant`, `join:session`, e adicionar tenant lookup em `join:customer` staff path (resolver customer.tenantSlug em DB e match)."

Os dois primeiros foram feitos em PR #38; o terceiro **ficou aberto**.

**Fix proposto**:

```ts
@SubscribeMessage('join:customer')
async handleJoinCustomer(
  @ConnectedSocket() client: AuthedSocket,
  @MessageBody() data: { customerId: string },
) {
  if (client.data.authType === 'staff') {
    // Round 14b (P1-NEW-1): cross-check que o customer pertence ao tenant
    // do staff. Sem isso, staff legítimo de tenant A subscreve room de
    // customer alheio em tenant B e recebe complaint/lgpd/late-arrival
    // payloads com PII.
    if (!client.data.staffTenantSlug) {
      client.emit('error', { message: 'WS handshake exige x-tenant-slug.' });
      return;
    }
    // SELECT 1 FROM <staffTenantSlug>.customers WHERE id = $1
    // — search_path scoped por TenantConnectionProvider.query, então
    // existência implica mesmo tenant. Customer de outro tenant retorna 0 rows.
    const exists = await this.tenantQueryWithSlug(
      client.data.staffTenantSlug,
      `SELECT 1 FROM customers WHERE id = $1`,
      [data.customerId],
    );
    if (!exists.length) {
      client.emit('error', { message: 'Customer não pertence ao seu tenant.' });
      return;
    }
    client.join(`customer:${data.customerId}`);
    return;
  }
  // session path inalterado
  if (
    client.data.authType !== 'session' ||
    client.data.customerId !== data.customerId
  ) {
    client.emit('error', { message: 'Customer mismatch' });
    return;
  }
  client.join(`customer:${data.customerId}`);
}
```

A injeção de `tenantQueryWithSlug` exige expor um helper no `TenantConnectionProvider` que aceita slug explícito (atual provider só lê do request middleware). Alternativa simpler: cachear `customerId → tenantSlug` em Redis quando o customer faz welcome/identify (TTL = recognition_token TTL).

**Severidade**: P1 — leak PII cross-tenant via WS pra staff sockets que conheçam UUIDs alheios. Não é P0 porque (a) requer `STAFF_API_KEY` shared (insider/operator) E (b) requer UUID conhecido (não enumerável diretamente). Mas é vetor real exploitable hoje, com payload sensível (text de complaint, manager DMs, audit data).

---

## Áreas auditadas e limpas

Pra documentar o sweep completo deste audit:

### Controllers (28) — todos com guards adequados

- `assistant.controller.ts` — SessionGuard + cookie ownership (round 11)
- `chat-history.controller.ts` — SessionGuard + cookie ownership (round 5)
- `complaints.controller.ts` — SessionGuard/StaffOnly+ManagerOnly + requireActiveStaffId (round 12-13)
- `customers.controller.ts` — markVip/unmarkVip ManagerOnly (round 10), welcome/identify rate-limit (round 9)
- `dashboard.controller.ts` — StaffOnly global (round 7)
- `deliveries.controller.ts` — StaffOnly global (round 7)
- `feedbacks.controller.ts` — SessionGuard + cookie (round 8) + service ownership (round 5)
- `home.controller.ts` — SessionGuard + cookie (round 12)
- `host.controller.ts` — StaffOnly+HostOrManager (DB role check) + requireStaffId (round 11)
- `late-arrival.controller.ts` — SessionGuard + host check + tableSessionId pinned (round 11)
- `lgpd.controller.ts` — SessionGuard + cookie (round 7)
- `menu.controller.ts` — SessionGuard global
- `order-ratings.controller.ts` — SessionGuard + cookie + service tableSessionId scope (round 10)
- `orders.controller.ts` — SessionGuard/StaffOrSession + actorType branch ownership (round 7)
- `payments.controller.ts` — SessionGuard + service tableSessionId ownership + SETNX lock (round 11)
- `promotions.controller.ts` — Get pública (intencional), mutações StaffOnly (round 5)
- `qr-issues.controller.ts` — stub returning [] (não vaza dados)
- `settings.controller.ts` — `/public` intentional (branding)
- `staff-messages.controller.ts` — StaffOnly + requireActiveStaffId + thread membership (round 13)
- `staff-table-merge.controller.ts` — StaffOnly+ManagerOnly + requireStaffId (round 10)
- `staff.controller.ts` — list/getById intentional (login flow), mutações StaffOnly (round 7), verify-pin throttle Redis IP (round 8)
- `table-merge.controller.ts` — SessionGuard + sourceTableSessionId pinned (round 12) + host check em approve/reject (round 14)
- `table-session.controller.ts` — `/init` HMAC validated (intentional public)
- `table.controller.ts` — SessionGuard + cookie (round 12)
- `vip.controller.ts` — StaffOnly+ManagerOnly + requireStaffId (round 10)
- `waiter-calls.controller.ts` — SessionGuard + cookie + service ownership (round 8)
- `zone-pause.controller.ts` — StaffOnly+ManagerOnly + requireStaffId (round 10)

### Services — ownership/scope tight

- `orders.service` — tableSessionId scoping em getOrderById/cancelOrder/updateStatus (round 7)
- `payments.service` — tableSessionId ownership em getPaymentStatus, SETNX lock em requestPayment (round 11)
- `feedbacks.service` — JOIN visits ON table_session filtra por mesa atual (round 5)
- `order-ratings.service` — JOIN orders por tableSessionId (round 10)
- `waiter-calls.service` — call.table_session_id scope em getCall/cancelCall
- `complaints.service` — manager assignment + escalation atribuição via callerResolver
- `table-merge.service` — host check em approve (linha 204-215) + reject (round 14)
- `late-arrival.service` — host check em isCallerHostOfRequest (round 6)
- `host.service` — todas queries via tenantConn (search_path scoped); tableNumber input → table.id lookup tenant-scoped
- `vip.service` — flags por tableSessionId tenant-scoped
- `staff-messages.service` — thread membership checked (round 13)
- `chat-history.service` — listMessagesForCustomer filtra por customerId (round 5)
- `lgpd.service` — kind+customerId derivado do cookie (round 7)
- `assistant.service` — IDOR check em customer participants (round 11)
- `home.service` — customerId opt do cookie (round 12)
- `deliveries.service` — INSERT atômico com unique constraint (round 5); audit `'garcom'` hardcoded fica como P3-NEW-1 backlog

### WS Gateway

- `handleConnection` staff: x-staff-id + x-tenant-slug MANDATORY (round 14)
- `join:tenant`: cross-check staffTenantSlug obrigatório (round 14)
- `join:session`: cross-tenant session lookup pra staff (round 9)
- `join:staff` / `join:manager`: requirestaffId match (round 9)
- **`join:customer`**: gap residual — staff path sem tenant lookup ← P1-NEW-1 acima
- Emit helpers: todos scoped por slug/session/customer/staff/manager rooms (auditado)

### AI service

- Middleware `X-AI-Service-Key` fail-CLOSE em prod (round 9)
- Tools registry: customer-facing schemas advertised, staff_* tools NÃO no advertised set
- `make_http_api_client`: NÃO encaminha `x-staff-key`, então mesmo se LLM chamar staff tool customer-side → apps/api retorna 403/404 (defense in depth)
- `dispatch_tool`: valida text obrigatório pra staff tools, mas confia em `is_staff` flag do request (controle reside em apps/api: customer chat path NÃO seta is_staff)

### Migrations

- 037 (table_merge_cooldown_directional): idempotente via `DO $$ ... IF NOT EXISTS` (round 8 fix)
- Outras migrations recentes: revisadas em rounds anteriores

### Race conditions / idempotency

- `orders.createOrder`: SETNX lock por (table_session_id, idempotencyKey) (round 11)
- `payments.requestPayment`: SETNX lock por scope (round 11)
- `deliveries.claimOrder`: INSERT + UNIQUE catch 23505 (round 5)
- `waiter-calls.acknowledgeCall`: UPDATE atômico WHERE status='pending' RETURNING (round 5)
- `complaints.create`: idempotency em layer service
- B-NEW-51 (feedbacks/complaints idempotency adicional): P2 deferred

---

## Backlog (P2/P3) consolidado

Mantido do round 13 — nenhum novo P2/P3 deste round:

| ID | Sev | Área | Resumo |
|---|---|---|---|
| B-NEW-41 | P2 | DB | pool size + remove query logging |
| B-NEW-51 | P2 | feedbacks/complaints | idempotency adicional |
| B-NEW-52 | P2 | menu/search | rate-limit |
| B-NEW-53 | P2 | parsing | JSON.parse defense |
| B-NEW-55 | P3 | WS | handshake rate-limit |
| B-NEW-59 | — | tests | coverage gaps |
| B-NEW-65 | P2 | WS | join:customer customer-side falha silenciosa |
| P3-NEW-1 | P3 | deliveries | audit attribution `'garcom'` hardcoded |

Recomendação: após fechar P1-NEW-1 (round 15 ou squash em PR #39), encerrar loop e criar issues separadas pra backlog.

---

## Conclusão

**Loop NÃO ENCERRA.** 1 P1 ativo (P1-NEW-1) — resíduo direto de recomendação não implementada do round 13. Fix é trivial (10-30 linhas: cache customerId→tenant em Redis ou expor tenantQueryWithSlug helper). Após esse fix, audit final deve retornar 0 P0/P1 e o loop fecha.
