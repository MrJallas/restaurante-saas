# Round 13 Bug-Hunt — Audit Final

Pós-Round 13 (PRs #28-#37 mergeados, HEAD em `6866a37`). Iteração de
fechamento do loop autônomo.

---

## Sumário

| Severidade | Contagem |
|---|---|
| **P0** | 0 |
| **P1** | 3 |
| **P2** | 1 |
| **P3** | 1 |

## Statement

**NÃO ENCERRA** — 0 P0 + 3 P1 ativos.

Os 3 P1 são vetores **NOVOS, exploitable HOJE**, não tratados em rounds
anteriores. Recomenda-se um Round 14 enxuto pra fechar:

1. **WS handshake `x-tenant-slug` opcional** (cross-tenant data leak via
   shared `STAFF_API_KEY`)
2. **`staff-messages.send` sem membership check** (sister fix do
   B-NEW-64 que cobriu só o read path)
3. **`table-merge.reject` sem host check** (asimetria com `approve`,
   non-host pode grief + cooldown 10min)

Backlog P2/P3 (1 + 1) consolidado abaixo. Fica como issues separadas
após o Round 14.

---

## Top Findings (P1)

### P1 #1 — WS handshake: `x-tenant-slug` é opcional, permitindo cross-tenant join

**File**: `apps/api/src/modules/websocket/events.gateway.ts:114-131`

**Severity**: P1 (Cross-tenant data leak — info disclosure de orders,
host events, complaints, staff messages, escalations entre tenants)

**Vector**:

`STAFF_API_KEY` é um **shared secret global** (não per-tenant — vide
`docker-compose.yml:84` + `.env.example`). Todos os web-staff apps de
todos os tenants usam a mesma key. O handshake WS do gateway exige
`x-staff-key` shared + `x-staff-id` UUID, mas `x-tenant-slug` é
**OPCIONAL**:

```ts
// events.gateway.ts:114-131
const tenantSlug =
  (client.handshake.headers['x-tenant-slug'] as string) ??
  (client.handshake.auth?.tenantSlug as string);

if (!staffId) {
  // ... reject when staffId missing
  return;
}
client.data.staffId = staffId;
if (staffRole) client.data.staffRole = staffRole;
if (tenantSlug) client.data.staffTenantSlug = tenantSlug;  // ← optional
```

A docstring (linha 178) afirma "handshake staff EXIGE `x-staff-id`
non-empty E `x-tenant-slug`" — o código apenas exige `x-staff-id`.

Os checks downstream em `join:tenant` (linha 196-202), `join:session`
(linha 240-244) e implicitamente `join:customer` usam guard
**conditional** `if (client.data.staffTenantSlug && ...)`. Quando
`staffTenantSlug` é `undefined`, o check é skipped → staff entra em
**qualquer** room.

**Concrete attack**:

1. Atacante (staff legítimo de tenant `restaurante-a` ou interno com
   acesso ao shared `STAFF_API_KEY`) abre WS:
   ```js
   io(WS_URL, {
     auth: {
       staffKey: STAFF_API_KEY,
       staffId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // any UUID v4
       // ❌ omite tenantSlug
     }
   })
   ```
2. Após connect, emite `join:tenant {slug: 'restaurante-b', role: 'manager'}`.
3. Como `client.data.staffTenantSlug` é `undefined`, o guard `if (... && ...)` curto-circuita → **join sucesso**.
4. Atacante recebe TODOS eventos de `tenant:restaurante-b`:
   `staff_message.received`, `complaint.received`, `complaint.responded`,
   `escalation.created`, `host.table_liberated`, `host.swap_requested`,
   `late_arrival.created`, `table_merge.created`, `zone_pause.started`,
   `lgpd.request_fulfilled`, etc — incluindo **PII de customers, threadIds
   internos, conteúdo de DMs entre managers**, audit data, financial
   movements (zone_pause/manager activity).

Também aplicável a `join:session` (recebe per-session events de tenants
alheios) e `join:customer` (que tem path no-op pra staff sem tenant
check — linhas 269-274).

**Round 9 (B-NEW-26) era pra ter fechado isso** mas o fix dependia
de `client.data.staffTenantSlug` ser sempre populado, o que não é o
caso. Sem deploy update simultâneo dos clients pra mandar `x-tenant-slug`,
o gateway permanece backward-compat permissivo.

**Fix proposto**:

```ts
// events.gateway.ts handleConnection() staff branch
if (!staffId) { /* reject */ }

// Round 13 fix: x-tenant-slug agora MANDATÓRIO no handshake staff.
// Era opcional + check downstream conditional → bypass completo.
if (!tenantSlug) {
  this.logger.warn(
    `Staff WS connection without x-tenant-slug rejected: ${client.id}`,
  );
  client.emit('error', {
    message: 'Staff WS handshake exige x-tenant-slug.',
  });
  client.disconnect(true);
  return;
}

client.data.staffId = staffId;
client.data.staffTenantSlug = tenantSlug; // sempre carimbado
```

E remover o `if (... &&)` conditional dos guards `join:tenant`,
`join:session`, e adicionar tenant lookup em `join:customer` staff path
(resolver customer.tenantSlug em DB e match).

---

### P1 #2 — `staff-messages.send` permite injetar mensagens em threads alheias

**File**: `apps/api/src/modules/staff-messages/staff-messages.service.ts:32-69`

**Severity**: P1 (Audit log spoof, harassment, social engineering em
private staff threads)

**Vector**:

Round 13 (B-NEW-64) corrigiu `listMessagesInThread` exigindo membership
em `staff_message_thread_participants`. Mas o **send path** ficou
descoberto. Quando o controller recebe `threadId` no DTO, o service
insere em `staff_messages` sem verificar se o sender é participante:

```ts
// staff-messages.service.ts:32-56
const result = await this.tenantConn.transaction(async (tx) => {
  let threadId = input.threadId ?? null;
  if (!threadId) {
    // create thread + add sender + recipient as participants
    ...
  }

  // ❌ Caso threadId fornecido: NENHUM check de membership.
  const msgRows = (await tx.query(
    `INSERT INTO staff_messages
       (thread_id, sender_staff_id, recipient_staff_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [threadId, input.senderStaffId, ...],
  ))
```

**Concrete attack**:

1. Manager M1 e M2 conversam em thread privada `T = abc-123`.
   `WsStaffMessageReceived` payload broadcasta em `tenant:${slug}` (linha
   750 em events.gateway.ts) com `payload.message.threadId = T` —
   **TODO o staff** do tenant subscrito em `tenant:${slug}` vê
   o threadId.
2. Waiter W (legitimamente conectado via `join:tenant`) captura T.
3. W posta `POST /:slug/staff-messages` com headers válidos
   (`x-staff-key`, `x-staff-id` próprio) e body:
   ```json
   {
     "senderStaffId": "<uuid-do-W>",
     "threadId": "abc-123",
     "body": "Manager M1 mandou eu te dizer X"
   }
   ```
4. Service insere row em `staff_messages` com `thread_id = T`,
   `sender_staff_id = W`. WS dispara `staff_message.received` pra
   participantes da thread (M1 e M2).
5. **M2 vê uma "mensagem do waiter W" injetada na conversa privada
   com M1**. Audit log mostra W como sender. Replay de scammer
   mandando "manager autorizou liberar VIP X" via thread real do
   manager → social engineering.

Vetor de leak do threadId é o mesmo do B-NEW-64 (a `tenant:${slug}`
broadcast). Round 13 fechou só o read path, send ficou.

**Fix proposto** (espelha o pattern de `listMessagesInThread`):

```ts
// staff-messages.service.ts dentro do tx
let threadId = input.threadId ?? null;
if (!threadId) {
  // create new thread (already correct)
  ...
} else {
  // Round 13 fix: exigir membership quando threadId é reusado.
  const memberRows = await tx.query(
    `SELECT 1 FROM staff_message_thread_participants
      WHERE thread_id = $1 AND staff_id = $2 AND left_at IS NULL
      LIMIT 1`,
    [threadId, input.senderStaffId],
  );
  if (!memberRows.length) {
    throw new HttpException(
      'Thread não encontrada ou acesso negado.',
      HttpStatus.NOT_FOUND,
    );
  }
}
```

---

### P1 #3 — `table-merge.reject` aceita non-host (asymmetric com `approve`)

**File**: `apps/api/src/modules/table-merge/table-merge.service.ts:274-292`

**Severity**: P1 (Grief / DoS social — non-host de qualquer mesa
participante pode rejeitar e instalar cooldown 10min unilateralmente)

**Vector**:

`approve` valida que `decidedByCustomerId` é o `host_customer_id` de
source ou target (linhas 204-215). `reject` **não faz check nenhum** —
aceita qualquer customer:

```ts
// table-merge.service.ts:280-292
async reject(id: string, decidedByCustomerId?: string, ...) {
  const result = await this.tenantConn.transaction(async (tx) => {
    const updated = unwrapRows(
      await tx.query(
        `UPDATE table_merge_requests
           SET status = 'rejected',
               decided_at = now(),
               decided_by_customer_id = COALESCE($1, decided_by_customer_id),
               ...
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [decidedByCustomerId ?? null, ...],
      ),
    );
    // ❌ não checa se decidedByCustomerId é host
```

O controller também não checa (apenas resolve customerId do cookie):

```ts
// table-merge.controller.ts:131-141
@Post(':id/reject')
@UseGuards(SessionGuard)
async reject(...) {
  const callerCustomerId = await this.callerResolver.requireCustomerId(req);
  return this.service.reject(id, callerCustomerId, dto.reason, slug);
}
```

**Concrete attack**:

1. Mesa 5 (host A) cria merge request com mesa 7 (host B).
   `WsTableMergeCreated` emite em `customer:${A}`, `customer:${B}` e
   `session:${5}`, `session:${7}` com `payload.requestId = R`.
2. Customer C — **participante da mesa 5 mas não host** — está conectado
   ao `session:${5}` room (qualquer participant of mesa 5 está). Captura R.
3. C posta `POST /:slug/table-merge-requests/R/reject` com cookie
   `recognition_token` válido (C tem o seu próprio).
4. Service rejeita: `status='rejected'`, instala cooldown 10min em
   `(source=mesa5, target=mesa7)`.
5. Host A não pode aprovar mais (request rejected). Host B nem viu o
   modal de decisão. Pra retentar A→B precisa esperar 10min de cooldown.

Especialmente perigoso quando A ainda nem decidiu (host A criou request
mas não chegou a clicar approve). C (talvez customer ressentido /
brincalhão de outra mesa que entrou na sessão de A) bloqueia
unilateralmente.

Cooldown é direcional (round 5 / migration 037), então A→B-rejected NÃO
bloqueia B→A — mas o impact ainda é negar a decisão de A em A→B.

**Fix proposto** (espelha a verificação de host de `approve`):

```ts
async reject(id, decidedByCustomerId, reason, slug) {
  if (!decidedByCustomerId) {
    throw new HttpException('decidedByCustomerId obrigatório.', BAD_REQUEST);
  }

  // Round 13 fix: simétrico ao approve. Sem isso non-host griefa.
  const sideRows = await this.tenantConn.query(
    `SELECT src.host_customer_id AS src_host, tgt.host_customer_id AS tgt_host
       FROM table_merge_requests mr
       JOIN table_sessions src ON src.id = mr.source_table_session_id
       JOIN table_sessions tgt ON tgt.id = mr.target_table_session_id
      WHERE mr.id = $1`,
    [id],
  );
  if (!sideRows.length) {
    throw new HttpException('Pedido não encontrado.', NOT_FOUND);
  }
  const { src_host, tgt_host } = sideRows[0];
  if (
    src_host !== decidedByCustomerId &&
    tgt_host !== decidedByCustomerId
  ) {
    throw new HttpException(
      'Apenas o host de cada mesa pode rejeitar.',
      FORBIDDEN,
    );
  }
  // ... continua com o UPDATE
}
```

---

## Backlog (P2 / P3 — não bloqueia encerramento)

### P2-NEW-1 — `staff-messages.markRead` aceita marcar broadcasts sem membership

**File**: `apps/api/src/modules/staff-messages/staff-messages.service.ts:170-187`

```ts
`UPDATE staff_messages
   SET read_at = now()
 WHERE id = $1
   AND (recipient_staff_id = $2 OR recipient_staff_id IS NULL)
   AND read_at IS NULL`
```

A cláusula `OR recipient_staff_id IS NULL` permite que qualquer staff
marque qualquer broadcast como lido por eles. **Read receipt é
personal**, então o impacto real é só "staff X marcou broadcast Y como
lido" mesmo que X não seja participante da thread. Audit ruidoso mas
não privilege escalation. Família do P1#2 — mesma fix sweep cobre.

P2 — recomendado fechar junto com Round 14.

---

### P3-NEW-1 — `deliveries.claimOrder/markDelivered` audit hardcoded como 'garcom'

**File**: `apps/api/src/modules/deliveries/deliveries.service.ts:53,94`

```ts
this.eventsGateway.emitOrderClaimed(slug, orderId, 'garcom');
// ...
`INSERT INTO order_status_history (order_id, ..., changed_by)
 VALUES ($1, 'ready', 'delivered', 'garcom')`
```

Não usa `requireActiveStaffId(req)` — não captura **qual** waiter
claimou o pedido. Deliveries module recém-fixado pra StaffOnlyGuard
(round 7 B-NEW-21), mas nunca cabeçou audit attribution. Não tem
vetor de exploit (atacante já passou pelo guard), apenas accountability
fraca. P3 — fica como tech debt pra próxima sprint.

---

## Áreas auditadas (clean / out-of-scope)

- ✅ Endpoints sem `@UseGuards`: todos os relevantes têm guards
  apropriados (controller-wide ou per-method). `:slug/settings/public` é
  intencionalmente público (público restaurant info).
- ✅ DTOs aceitando customerId/staffId via body: sweep round 8/10/11/12
  cobriu; `CallerResolverService.requireCustomerId/requireStaffId/
  requireActiveStaffId` é usado em todos sites críticos.
- ✅ AI tools com side-effects: `api_client` em `services/ai-service`
  não passa `x-staff-key` nem session cookie — todos POST pra apps/api
  retornam 401 (graceful fallback). Funcionalmente dead code, sem vetor.
  Dispatch via `/chat` não propaga `isStaff/isManager` (default False).
- ✅ Migrations idempotentes: 037-039 verificadas, todas usam
  `IF EXISTS`/`IF NOT EXISTS` e DO blocks com guards.
- ✅ Race conditions / idempotency: orders SETNX (round 10), payments
  SETNX (round 11), order_deliveries UNIQUE (round 5/migration 038),
  table_merge_cooldowns UNIQUE direcional (037), idempotencyKey em
  POST /orders.
- ✅ Service-side ownership: orders, payments, order-ratings, feedbacks,
  late-arrival, complaints, lgpd-requests, chat-history — todos
  filtram por `table_session_id` ou `customer_id` em queries críticas.
- ✅ WS scoped emits: server.to(`tenant:${slug}`) ou rooms scoped em
  todos os emits (round 8 fix do `server.emit` global).
- ⚠️ B-NEW-65 (P2 deferred): WS join:customer falha silenciosa pra
  customer sockets. Já documentado no backlog do prompt — não
  re-reportado.

---

## Próximos passos

1. **Round 14** focado nos 3 P1 + P2-NEW-1 (todos no mesmo PR enxuto).
2. P3-NEW-1 (deliveries audit attribution) → issue separada.
3. Backlog P2/P3 do prompt (B-NEW-41, B-NEW-51, B-NEW-52, B-NEW-53,
   B-NEW-55, B-NEW-59, B-NEW-65) → issues separadas pra próxima sprint
   conforme orientação original.

Após Round 14, espera-se **0 P0 + 0 P1** → loop encerra de fato.
