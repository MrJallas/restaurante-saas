# Round 9 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes do PR Round 9 (B-NEW-33/34/35/36/37/26/40/44/45 do round 7).
> Target: descobrir bugs NOVOS pós PR round 9. Foco em achados sistêmicos
> que sobreviveram aos rounds 4–9. Sem rodar — só audit estático.

## TL;DR

8 achados novos · severidades misturadas, **2 P0/P1** críticos, 4 P2, 2 P3.

- **B-NEW-46 (P1)**: `POST /:slug/orders` — idempotency key NÃO é atômico apesar do comentário em `orders.service.ts:81-82` afirmar "Usa Redis SET NX EX". O código real (`orders.service.ts:88-258`) faz **GET** (linha 88) → **transaction commit** (linha 247) → **`redis.set(...)`** plain (linha 253-257). Dois POSTs concorrentes com mesma `idempotencyKey` ambos GET retornam null, ambos INSERT, ambos `redis.set` (último vence). Resultado: 2 orders duplicados, customer cobrado 2x. **Round 5 fix incompleto**. Mesmo pattern (Redis SETNX faltando) provavelmente em payments quando ele ganhar idempotency (B-NEW-42 deferred).
- **B-NEW-47 (P1)**: `GET /:slug/order-ratings/:orderId` (order-ratings.controller.ts:72-76) sem ownership check — `SessionGuard` apenas. Customer A em mesa X, conhecendo orderId de mesa Y (vaza via `GET /staff/my-tables` do round 7 ou conhecendo UUIDs adjacentes), lê review + comment de QUALQUER order do tenant. Comment até 2000 chars (PII risk: customer pode ter escrito CPF, telefone). **Mesma família B-NEW-17 (feedbacks)** que foi fixada em round 5 com JOIN visits → table_session — não replicado em order-ratings.
- **B-NEW-48 (P1)**: `POST /:slug/customers/:customerId/vip` + `DELETE :customerId/vip` (customers.controller.ts:224-235) com **`StaffOnlyGuard` apenas, sem `ManagerOnlyGuard`**. Comentário JSDoc linha 223 explicitamente diz "Manager marks a customer as VIP" mas o guard permite qualquer waiter/cook com `x-staff-key`. VIP flag (`customers.is_vip`) é permanente cross-session e influencia priorização. Waiter pode flagar customer VIP sem auth de manager, ou DESmarcar VIP de cliente real (sabotage). **Mesma família B-NEW-22** (ManagerOnlyGuard escapeed in some paths).
- **B-NEW-49 (P1)**: Múltiplos endpoints aceitam `staffId` UUID arbitrário no body sem validar contra `x-staff-id` header. Audit log spoof: manager X faz ação mas registra `staff_id = Y` (colega). Endpoints afetados:
  - `POST /:slug/staff/table-merges/force` (`dto.staffId` em StaffForceMergeDto) — staff-table-merge.controller.ts:59
  - `POST :id/respond` + `POST :id/resolve` (complaints.controller.ts:159, 169)
  - `POST :slug/staff-messages/:id/read` (staff-messages.controller.ts:82)
  - `POST :slug/staff-messages` (`dto.senderStaffId` linha 22)
  - `POST :slug/zone-pauses` (`dto.startedBy`) + `POST :id/end` (`dto.endedBy`) — zone-pause.controller.ts:52, 58
  - `POST :tableSessionId/flags` (`dto.staffId`, `dto.customerId`) — vip.controller.ts:63-64
  - Host `LiberateTableDto`, `CreateSwapDto`, `UpdateSwapDto`, `ToggleVipDto` — host/dto/host.dto.ts
  Round 7 cobriu customer-side (complaints/feedbacks/order-ratings derivam customerId do cookie). Staff-side ficou aberto.
- **B-NEW-50 (P1)**: `POST /:slug/table-merge-requests` (table-merge.controller.ts:77-85) ainda aceita `requestingCustomerId` UUID arbitrário do body sem cross-check com cookie. Round 9 fixou `:id/approve` e `:id/reject` (cookie ownership) mas `create` foi esquecido. Customer A em mesa X cria merge request "em nome de" customer Y (UUID conhecido) → audit log mostra B como requester, manager DM vai pra B, FE de B mostra modal de junção que ele não pediu. **Mesma família B-NEW-39 (round 7) — fix parcial (approve/reject) sem cobrir create**.
- **B-NEW-51 (P2)**: Race condition em `feedbacks.submitFeedback` (feedbacks.service.ts:20-30) — SELECT-then-INSERT TOCTOU. Tabela `feedbacks` (migration 013) NÃO tem UNIQUE constraint em `visit_id` apesar do service tentar dedup. Two POSTs concorrentes ambos passam o "ja existe?" check, ambos INSERT. `idx_feedbacks_visit_id` é NON-unique. Customer double-tap "Enviar feedback" → 2 rows. Manager dashboard mostra 2 feedbacks pra mesma visita (rating médio falsifica trend). **Idempotency key faltando**. `complaints.create` (complaints.service.ts:41-57) idem — sem dedup nenhum, double-tap = 2 reclamações idênticas → manager spam.
- **B-NEW-52 (P2)**: `GET /:slug/menu/search` (menu.controller.ts:33-41 + menu.service.ts:73-85) sem cap de tamanho do query, sem rate limit per-session. `?q=...` aceita qualquer string ≥ 2 chars (`query.trim().length < 2`). `pattern = '%${query}%'` vira `ILIKE` full-table-scan. Customer com session pode spammar `?q=<10KB-string>` → DB CPU saturated, latência geral cresce, outros customers degradam. Por mesa basta 1 customer. Cap de length + rate-limit por session/IP missing. Mesma família B-NEW-25 (ai-service throttle) mas pra DB.
- **B-NEW-53 (P2)**: `JSON.parse` sem try/catch em 4 hot paths — se Redis retornar payload corrompido (versão antiga do shape, key colision, inserção manual via `redis-cli`) lança exception não-handled:
  - `session.guard.ts:39` — request 500 silencioso (cliente vê 500 em qualquer rota protegida)
  - `staff-or-session.guard.ts:76` — idem
  - `events.gateway.ts:134` (handleConnection) — async crash, socket conecta sem dados completos
  - `table-session.service.ts:173` (`getSessionFromToken`) — propagado pra caller
  Operacional: corrupt key = downtime parcial. Defesa-em-depth missing. `events.gateway.ts:230-244` JÁ adicionou try/catch (round 9 fix B-NEW-34) — não estendeu pros outros sites.
- **B-NEW-54 (P3)**: `EventsGateway` decorator `cors.origin` hardcoded `['http://localhost:3003', 'http://localhost:3002']` (events.gateway.ts:67-69). Em prod `CORS_ORIGINS` env var é honrada pelo `main.ts:11-14` (HTTP) mas WS gateway ignora. Deploy em produção com TLS e domínio real → WS handshake falha em browsers que respeitam CORS no Origin header. Inconsistência interna (HTTP usa env, WS hardcoded). Round 7 reportou; round 9 não fixou.
- **B-NEW-55 (P3)**: `handleConnection` no WS gateway não tem rate-limit no handshake. Cliente que envia auth inválida é desconectado, mas pode reconectar imediatamente. Loop de reconnect (network blip, malicious script) dispara `redis.get(session:<token>)` cada vez. Cluster de N clientes infectados = N×reconnect/s = saturação Redis. Sem `client.handshake.address` throttle nem cookie-based dedup. Combina com B-NEW-43 (Redis sem auth interno) — atacante já conectado sustenta backpressure trivialmente.

Detalhes abaixo.

---

## B-NEW-46 · Orders idempotency key não-atômico (P1)

**Severidade**: **P1** (double-charge possível em concurrency).

**Source**: `apps/api/src/modules/orders/orders.service.ts:78-258`.

```ts
// Comentário linha 81-82 PROMETE: "Usa Redis SET NX EX como guarda atomica"
const idemKey = idempotencyKey
  ? `order_idem:${tableSessionId}:${idempotencyKey}`
  : null;
if (idemKey) {
  const existing = await this.redis.get(idemKey);  // ← read-only
  if (existing) {
    // ... return cached
  }
}
// ... transaction insert order
const order = await this.tenantConn.transaction(async (tx) => { ... });
// ...
if (idemKey) {
  await this.redis.set(            // ← plain SET, NÃO NX
    idemKey,
    JSON.stringify({ orderId: order.id }),
    IDEMPOTENCY_TTL_SECONDS,
  );
}
```

**Bug**: O fluxo é **GET → INSERT → SET**, não **SET-NX-then-INSERT**. Em concurrency:

```
T1: req A: redis.get(key) → null
T2: req B: redis.get(key) → null (key ainda não setada — A não terminou)
T3: req A: tx começa → INSERT order A
T4: req B: tx começa → INSERT order B
T5: req A: tx commit
T6: req B: tx commit
T7: req A: redis.set(key, orderA)
T8: req B: redis.set(key, orderB)  // overwrites
```

Resultado:
- **2 orders idênticos** no DB (duplicate dishes na cozinha, KDS spam).
- Redis aponta pra orderB. Retry subsequente com mesma key retorna orderB.
- **Customer cobrado 2x** se ambos ordens chegam a `delivered`.
- Cancelamento manual: customer perde a janela de 15s pra um dos orders (auto-confirm sweep manda os dois pra cozinha).

**Repro hipotético**:
1. Customer abre WelcomeModal, escolhe items, clica "Confirmar pedido" (idempotencyKey = uuidv4()).
2. Network blip: FE retry automatico em 200ms (toast loading não dispensa). Mesmo idempotencyKey.
3. Backend: 2 POSTs em paralelo. Ambos passam por orders.service:88 (GET=null). Ambos `INSERT INTO orders` no mesmo tableSessionId, mesma idempotencyKey, mesmos items.
4. Cozinha vê 2 cards de "Mesa 12 · Hambúrguer x2" → duplicação visual + cooking duplicado.

**RedisService` (apps/api/src/infra/redis/redis.service.ts:15-21)** não expõe NX:

```ts
async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds) {
    await this.client.set(key, value, 'EX', ttlSeconds);  // ← falta 'NX'
  } else {
    await this.client.set(key, value);
  }
}
```

**Fix sugerido**:
1. Adicionar `setNX` ao `RedisService`:
   ```ts
   async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
     const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
     return result === 'OK';
   }
   ```
2. Em `orders.service.ts`: ANTES da transaction, fazer `setNX(key, JSON.stringify({inflight: true}), IDEMPOTENCY_TTL_SECONDS)`. Se `false` (key já existe) → loop GET até ver `{orderId}` ou timeout → retornar cached.
3. Após commit, sobrescrever com `set(key, {orderId})` (SET regular OK porque a guarda já garante 1 winner).
4. Pattern aplicável imediatamente quando B-NEW-42 (payments idempotency) for implementado — não repetir o erro.

---

## B-NEW-47 · GET order-ratings sem ownership check (P1)

**Severidade**: **P1** (IDOR · vaza review/comment de qualquer order do tenant).

**Source**:
- `apps/api/src/modules/order-ratings/order-ratings.controller.ts:72-76`.
- `apps/api/src/modules/order-ratings/order-ratings.service.ts:98-118`.

Controller:
```ts
@Get(':orderId')
@UseGuards(SessionGuard)   // ← só valida que tem session, não ownership
async getByOrderId(@Param('orderId') orderId: string) {
  return this.service.getByOrderId(orderId);
}
```

Service:
```ts
async getByOrderId(orderId: string) {
  const rows = await this.tenantConn.query(
    `SELECT * FROM order_ratings WHERE order_id = $1`,
    [orderId],
  );
  // ... returns rating, comment (até 2000 chars), submittedAt
}
```

**Bug**: Customer A em mesa 5 conhecendo orderId de mesa 7 (vaza via `GET /staff/my-tables` quando customer é session-actor — round 7 deixou aberto, ou via WebSocket `order:status` events broadcast com orderId no payload, ou via guess UUID adjacent timestamps) faz `GET /:slug/order-ratings/<orderId-mesa-7>` → recebe rating + comment do customer da mesa 7.

**Comment** é campo `TEXT` no DB (`order_ratings.comment`, migration 026:22), até 2000 chars (DTO MaxLength). Customers escrevem texto livre — pode incluir CPF, telefone, e-mail (LGPD), ou complaint específica que vira complaint downstream.

**Repro hipotético**:
1. Customer A em mesa 5 obtém orderId de mesa 7:
   - Via WS: `socket.emit('join:session', {sessionId: <mesa-7>})` foi fixado round 9 (B-NEW-34) — bloqueado pra customers. Mas `subscribe('order:status')` no `tenant:slug:waiter` room precisa staff. OK.
   - Via `GET /staff/my-tables` (round 9 fix B-NEW-44 filtra por session quando actorType=session — mas customer ainda vê própria mesa só. Atacante busca outras mesas via dashboard → bloqueado).
   - Via UUID guess (orderId é v4 random — efetivo bloqueio).
   - **Vetor real**: customer da MESMA mesa lê review de outro customer da mesma mesa. Via `GET /:slug/orders` (mesma sessão), customer A vê orders de customer B (bill_mode=individual). orderId está no response. Atacante então `GET /:slug/order-ratings/<orderId-de-B>` → review de B + comment.
2. Comment de B pode conter "Cobrado errado meu cartão 1234..." → atacante na mesma mesa (potencialmente desconhecido) lê dados de pagamento.

**Comparar com `feedbacks.getFeedbackByVisit`** (round 5 B-NEW-17 fix em feedbacks.service.ts:63-74):
```ts
SELECT f.* FROM feedbacks f
JOIN visits v ON v.id = f.visit_id
WHERE f.visit_id = $1 AND v.table_session_id = $2  // ← ownership via JOIN
```

`order-ratings` precisa do mesmo JOIN. Round 5 fixou feedbacks; **order-ratings ficou esquecido**.

**Fix sugerido**:
1. `getByOrderId(orderId, tableSessionId)` — JOIN com orders pra filtrar:
   ```sql
   SELECT or.* FROM order_ratings or
   JOIN orders o ON o.id = or.order_id
   WHERE or.order_id = $1 AND o.table_session_id = $2
   ```
2. Controller passa `session.sessionId` igual ao feedbacks pattern.
3. 404 sem distinguir "não existe" de "não é seu" (round 5 pattern).

---

## B-NEW-48 · markVip/unmarkVip sem ManagerOnlyGuard (P1)

**Severidade**: **P1** (role escalation — waiter age como manager).

**Source**: `apps/api/src/modules/customers/customers.controller.ts:223-235`.

```ts
/** Manager marks a customer as VIP (permanent flag on customers table). */
@Post(':customerId/vip')
@UseGuards(StaffOnlyGuard)   // ← falta ManagerOnlyGuard
async markVip(@Param('customerId') customerId: string) {
  return this.customersService.setVipFlag(customerId, true);
}

/** Manager unmarks a customer as VIP. */
@Delete(':customerId/vip')
@UseGuards(StaffOnlyGuard)   // ← idem
async unmarkVip(@Param('customerId') customerId: string) {
  return this.customersService.setVipFlag(customerId, false);
}
```

**Bug**: JSDoc explicitamente diz "Manager marks…" mas o guard é `StaffOnlyGuard` — qualquer staff (waiter, cook) com `x-staff-key` pode flagar/desflagar VIP de qualquer customer.

`customers.is_vip` é flag PERMANENTE cross-session (migration 020). Diferente de `table_sessions.flags['vip']` (session-scoped) que tem `ManagerOnlyGuard` em `vip.controller.ts:51`. Comentário canônico em `vip.controller.ts:42-46`:
> "Session flag toggle endpoint... Manager / host can flag a session as VIP / allergy. Staff 'waiter' cannot..."

Mas o equivalente customer-level (que é mais sério, persiste entre visitas) não tem o mesmo guard.

**Repro hipotético**:
1. Waiter em conflito com manager: `curl -X DELETE /:slug/customer/<UUID-VIP-real>/vip -H 'x-staff-key: ...'`. Cliente VIP perde flag → atendimento prioritário cai.
2. Inverso: waiter em conluio com pessoa externa: marca random customer como VIP → recebe atendimento priority sem manager autorizar.
3. Sabotage: waiter desliga VIP de top-spender 1h antes da visita prevista; manager descobre tarde demais.

**Comparar com `vip.controller.ts:51-52`**:
```ts
@Post(':tableSessionId/flags')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)  // ← duplo guard correto
async toggle(...) { ... }
```

**Fix sugerido**: adicionar `ManagerOnlyGuard` em ambas as routes. 1 linha cada.

```ts
@Post(':customerId/vip')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
async markVip(...) {...}

@Delete(':customerId/vip')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
async unmarkVip(...) {...}
```

---

## B-NEW-49 · staffId arbitrário no body em endpoints staff-side (P1)

**Severidade**: **P1** (audit log spoof · cross-staff impersonation).

**Sources** (8 sites confirmados):

1. `staff-table-merge.controller.ts:18-32` — `StaffForceMergeDto.staffId: @IsUUID() staffId!` (REQUIRED no body), passado direto pro service.forceMerge → audit `staff_id = dto.staffId`. Manager M faz `force` mas registra `staffId = colega-X`.

2. `complaints.controller.ts:152-170` — `RespondDto.staffId?` (optional, mas service usa quando presente).
   ```ts
   return this.service.respond(id, { staffId: dto.staffId }, dto, slug);
   return this.service.resolve(id, { staffId: dto.staffId }, slug);
   ```

3. `staff-messages.controller.ts:21-22, 47-48, 82` — `SendMessageDto.senderStaffId: @IsUUID() senderStaffId!` + `ReadDto.staffId: @IsUUID() staffId!`. Send/markRead em nome de qualquer staff conhecendo UUID.

4. `zone-pause.controller.ts:35-53` — `CreateZonePauseDto.startedBy?: @IsUUID()` + `EndZonePauseDto.endedBy?: @IsUUID()`. Manager pausa "em nome de" outro manager.

5. `vip.controller.ts:32-39` — `ToggleFlagDto.staffId?` + `ToggleFlagDto.customerId?` (UUIDs). Audit: VIP flagged "por" staffId arbitrário.

6. `host/dto/host.dto.ts` (CreateSwapDto, UpdateSwapDto, LiberateTableDto, ToggleVipDto, CreateReservationDto) — todos têm `staffId?: @IsUUID()` opcional aceito do body.

7. `complaints.respond/resolve` (referenciado acima) chama service que usa `by.staffId` em queries de audit (response_by_staff_id, resolved_by_staff_id).

8. `complaints.controller.ts:158-170` — `dto.staffId` passado direto ao service.

**Bug comum**: o `ManagerOnlyGuard`/`HostOrManagerGuard` (round 7 + round 9) valida que `x-staff-id` header bate com um staff válido com role apropriada no DB. Mas o **body** ainda aceita `staffId` arbitrário, e os services usam **o body, não o header validado**. Audit logs gravam `staff_id` falso.

**Repro hipotético** (force merge):
1. Manager M (UUID = `M-uuid`) tem `x-staff-key` + `x-staff-id: M-uuid` válidos.
2. Manager M tem rixa com waiter W (UUID = `W-uuid`).
3. Curl: `POST /:slug/staff/table-merges/force -H 'x-staff-id: M-uuid' -H 'x-staff-key: ...' -d '{"sourceTableSessionId": "...", "targetTableSessionId": "...", "staffId": "W-uuid", "reason": "Customers solicitaram juncao"}'`.
4. ManagerOnlyGuard passa (M-uuid é manager). Service grava `staff_id = W-uuid` em `escalation_chains.steps` jsonb.
5. Audit posterior: gerente quer saber QUEM forçou junção → log diz "W (waiter)". W toma blame.

**Comparar com customer-side fixes (round 7-9)**: `complaints.create`, `feedbacks.submit`, `order-ratings.submit`, `late-arrival.create`, `lgpd.create`, `chat-history.*`, `table-merge.approve/reject` — todos derivam customerId do cookie, ignoram body.

**Staff-side ficou aberto**. Pattern simétrico está faltando.

**Fix sugerido**:
1. Adicionar helper `CallerResolverService.requireStaffId(req)` que lê `x-staff-id` header (ManagerOnlyGuard já valida UUID + role + DB) e retorna.
2. Em cada controller, `const callerStaffId = await this.callerResolver.requireStaffId(req);` e ignorar `dto.staffId`.
3. Remover `staffId` dos DTOs (forçar ignoring) ou marcar deprecated.
4. Audit logs: sempre usar `callerStaffId` (header), nunca dto.

Refactor médio (~8 controllers afetados). Família clara — um sweep cobre tudo.

---

## B-NEW-50 · table-merge create com requestingCustomerId arbitrário (P1)

**Severidade**: **P1** (impersonation · audit spoof + fan-out spam).

**Source**:
- `apps/api/src/modules/table-merge/table-merge.controller.ts:77-85`.
- `apps/api/src/modules/table-merge/table-merge.service.ts:51-152`.

Controller:
```ts
@Post()
@UseGuards(SessionGuard)
async create(
  @Param('slug') slug: string,
  @Body() dto: CreateMergeDto,    // ← contém requestingCustomerId
  @Session() _s: SessionData,
) {
  return this.service.createRequest(dto, slug);   // ← passa direto
}
```

DTO (table-merge.controller.ts:25-43):
```ts
class CreateMergeDto {
  @IsUUID() sourceTableSessionId!: string;
  @IsUUID() targetTableSessionId!: string;
  @IsUUID() requestingCustomerId!: string;   // ← arbitrário do body
  @IsOptional() @IsUUID() targetCustomerId?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
```

Service (table-merge.service.ts:109-124):
```ts
const rows = await this.tenantConn.query(
  `INSERT INTO table_merge_requests
     (source_table_session_id, target_table_session_id,
      requesting_customer_id, target_customer_id, ...)
   VALUES ($1, $2, $3, $4, ...)`,
  [
    input.sourceTableSessionId,
    input.targetTableSessionId,
    input.requestingCustomerId,   // ← gravado no DB
    input.targetCustomerId ?? null,
    ...
  ],
);
```

**Bug**: Round 9 fixou `:id/approve` e `:id/reject` (table-merge.controller.ts:94-116) — derivam `decidedByCustomerId` do cookie via `callerResolver.requireCustomerId(req)`. **Mas `create` ficou esquecido**.

Customer A em mesa X (session válida + recognition_token) cria merge request em nome de customer B (UUID conhecido — vaza via mesma mesa, ou via leak). Service grava `requesting_customer_id = B`. Subsequentes:
- WS event `table_merge.created` é broadcast pra `customer:${originCustomerId}` (events.gateway.ts:561-575) — vai pro customer B (vítima), não pro A.
- B vê modal "Mesa Y quer juntar com você" sem ter pedido nada.
- Audit log: "B requisitou junção". Manager investigando vê B como autor.
- Combinado com B-NEW-49 (staffId arbitrário no force merge), atacante pode encadear: cria fake request → manager force aprova "porque os dois pediram" → atacante junta mesas via B+manager X.

**Repro hipotético**:
1. Customer A na mesa 5 (sessionId-A). Pega UUID do customer B na mesa 7 via `GET /staff/my-tables` (b-NEW-44 round 9 só filtra ticket — `participantCount` ainda exposto talvez) ou via WS `table_merge.created` pra outras requests passadas.
2. `POST /:slug/table-merge-requests` body:
   ```json
   {
     "sourceTableSessionId": "<sessionId-7>",  // mesa 7
     "targetTableSessionId": "<sessionId-5>",  // mesa 5
     "requestingCustomerId": "<customerId-B>",  // UUID alheio
     "targetCustomerId": "<customerId-A>",
     "message": "Aceita?"
   }
   ```
3. Service cria request stamped com B como requester. WS emit pra customer:B → modal aparece pro B (que estava jantando tranquilo).
4. B confused, manager involved, audit log shows B requested.

**Fix sugerido** (mesma família dos round-7-fixes):
```ts
@Post()
@UseGuards(SessionGuard)
async create(
  @Param('slug') slug: string,
  @Body() dto: CreateMergeDto,
  @Session() s: SessionData,
  @Req() req: Request,
) {
  const callerCustomerId = await this.callerResolver.requireCustomerId(req);
  // Validar que sourceTableSessionId é o da sessão do caller
  if (dto.sourceTableSessionId !== s.sessionId) {
    throw new ForbiddenException('source deve ser sua mesa.');
  }
  return this.service.createRequest({
    ...dto,
    requestingCustomerId: callerCustomerId,  // ← do cookie, ignora body
  }, slug);
}
```

Service.createRequest pode parar de receber `requestingCustomerId` do DTO e usar callerCustomerId resolvido controller-side.

---

## B-NEW-51 · feedbacks/complaints sem idempotency + sem UNIQUE (P2)

**Severidade**: **P2** (double-submit data integrity).

**Source**:
- `apps/api/src/modules/feedbacks/feedbacks.service.ts:19-54`.
- `apps/api/src/modules/complaints/complaints.service.ts:22-79`.
- `packages/database/migrations/tenant-template/013_create_feedbacks.sql:1-17` (sem UNIQUE).
- `packages/database/migrations/tenant-template/026_create_complaints_and_order_ratings.sql:51-71` (sem UNIQUE).

`feedbacks.submitFeedback` faz SELECT-then-INSERT TOCTOU:
```ts
if (input.visitId) {
  const existing = await this.tenantConn.query(
    `SELECT id FROM feedbacks WHERE visit_id = $1`,
    [input.visitId],
  );
  if (existing.length > 0) throw 'Feedback ja enviado.';
}
const rows = await this.tenantConn.query(
  `INSERT INTO feedbacks (visit_id, customer_id, ...) VALUES (...)`,
  [...],
);
```

Migration 013 só tem `idx_feedbacks_visit_id` (NON-unique). Dois POSTs concorrentes ambos passam o SELECT, ambos INSERT, ambos sucesso. **Manager dashboard mostra 2 feedbacks** mesma visit (rating médio inflado). Idem `complaints.create` que **nem tenta dedup** — qualquer double-tap = 2 reclamações idênticas → manager spam de notificações + escalation chain dupla disparada.

`order_ratings` migration 026:37-38 tem `CREATE UNIQUE INDEX idx_order_ratings_unique_order ON order_ratings(order_id)` — ÚNICO endpoint da família que tem UNIQUE. Inconsistência interna.

**Repro hipotético**:
1. Customer termina meal, vê tela de feedback. Clica "Enviar" 2x rapidinho (network slow).
2. FE envia 2 POSTs com mesmo visitId.
3. Backend insere 2 rows. Cada uma com `created_at` 30ms apart.
4. `dashboard/feedback-summary` calcula `AVG(overall_rating)` = (5 + 5) / 2 = 5 (correto). Mas `COUNT(*) = 2`. Manager pensa "tive 2 feedbacks 5★ na mesma mesa".

Pra complaint: pior — cada INSERT dispara `emitComplaintReceived` (events.gateway.ts:680-691). Manager recebe 2 notifications, abre 2 cards no dashboard, escalation chain inicia 2x → host + chefe + manager via WS event spam.

**Fix sugerido**:
1. `feedbacks`: adicionar `UNIQUE INDEX idx_feedbacks_unique_visit ON feedbacks(visit_id) WHERE visit_id IS NOT NULL` (migration nova). Capturar `23505` no service e retornar feedback existente como idempotent.
2. `complaints`: adicionar `idempotencyKey` opcional no DTO + Redis SETNX guard (mesmo pattern de orders, mas correto — ver B-NEW-46).
3. `complaints` long-term: UNIQUE em `(visit_id, customer_id, problem_type) WHERE submitted_at > now() - interval '5 minutes'` — bloqueia duplicate só dentro de janela. Postgres não suporta time-based partial directly; aplicar via app-side dedup com Redis.

---

## B-NEW-52 · /menu/search sem cap + sem rate limit (P2)

**Severidade**: **P2** (DoS via DB CPU).

**Source**:
- `apps/api/src/modules/menu/menu.controller.ts:33-41`.
- `apps/api/src/modules/menu/menu.service.ts:73-85`.

```ts
// menu.controller.ts:33
@Get('search')
@UseGuards(SessionGuard)
async search(@Query('q') query: string) {
  if (!query || query.trim().length < 2) return { items: [] };
  const items = await this.menuService.search(query.trim());
  return { items };
}

// menu.service.ts:73
async search(query: string) {
  const pattern = `%${query}%`;
  return this.tenantConn.query(
    `SELECT id, name, ... FROM menu_items
     WHERE is_available = true
       AND (name ILIKE $1 OR tags @> ARRAY[$2]::text[] OR ingredients @> ARRAY[$2]::text[])
     ORDER BY total_orders DESC
     LIMIT 20`,
    [pattern, query.toLowerCase()],
  );
}
```

**Bug**:
1. `query` vem direto do query-string sem `@MaxLength`. `class-validator` não roda em query params automaticamente; o controller aceita `string` puro. Express body limit é ~100KB, query-string limit é ~8KB (URL.length). Customer pode mandar `?q=<8000-chars>`.
2. `pattern = '%${query}%'` vira `ILIKE '%<8KB>%'` — Postgres faz full table scan sem index utilizável (índice trigram não existe, gen2 da tabela aceita milhares de menu_items).
3. Por sessão, customer faz `for (let i = 0; i < 100; i++) fetch('/menu/search?q=' + 'a'.repeat(8000))`. 100 requests paralelos. Cada um roda 8K-char ILIKE em N rows.
4. **DB CPU saturated**. Outros customers (KDS, dashboard) recebem queries lentas. Combinado com B-NEW-41 (DB pool size = 10 default), 10 slow searches já saturam.

**Sem rate-limit por IP/session** em menu/search. Round 6 fix focou em `/identify` e `/welcome`; menu não foi tocado.

**Comparar com `assistant.service.sendMessage`** (assistant.service.ts:208-220) — tem `MAX_MESSAGES_PER_SESSION` (5) por 4h via Redis. menu/search precisa equivalente.

**Fix sugerido**:
1. DTO no controller:
   ```ts
   class SearchDto {
     @IsString() @MinLength(2) @MaxLength(60) q!: string;
   }
   ```
2. Rate-limit por session: 30 searches / 5 min em Redis (similar ao assistant pattern).
3. Cap também o LIMIT da query a 20 (já tem).
4. Considerar `pg_trgm` GIN index pra search ser O(log n) em vez de O(n).

---

## B-NEW-53 · JSON.parse sem try/catch em hot paths (P2)

**Severidade**: **P2** (downtime parcial em corrupt cache).

**Sources**:
- `apps/api/src/common/guards/session.guard.ts:39`.
- `apps/api/src/common/guards/staff-or-session.guard.ts:76`.
- `apps/api/src/modules/websocket/events.gateway.ts:134` (handleConnection branch session).
- `apps/api/src/modules/table-session/table-session.service.ts:173` (`getSessionFromToken`).

```ts
// session.guard.ts:39
const data = await this.redis.get(`session:${token}`);
if (!data) throw 'Sessao expirada...';
request.sessionData = JSON.parse(data) as SessionData;   // ← throws if corrupt
```

```ts
// events.gateway.ts:134 (handleConnection)
if (sessionToken) {
  const data = await this.redis.get(`session:${sessionToken}`);
  if (data) {
    const session = JSON.parse(data) as { sessionId: string; customerId?: string };  // ← throws
    client.data.authType = 'session';
    // ...
  }
}
```

**Bug**: `JSON.parse` lança `SyntaxError` quando string é inválida. Cenários reais:
1. Redis admin debugando: `redis-cli SET session:<UUID> 'broken'`.
2. Schema migration: round anterior gravou shape `{sessionId, ...}`, round novo espera `{sessionId, customerId, schemaName}`. Cache antigo persiste 4h pós deploy → temporariamente shape mismatch (mas JSON.parse funciona, só `as SessionData` cast falha silentemente).
3. Redis OOM kill em rota crítica → gravação truncada → JSON parse falha.
4. Atacante com Redis access (B-NEW-43 deferred — Redis sem auth) corrompe sessions.

Em **handleConnection** (events.gateway.ts:134), exception em async handler em socket.io é logada por NestJS mas NÃO disconecta o client com mensagem clara. Cliente fica conectado sem `client.data.authType` setado (linha 138 é skipped) — todos `join:*` posteriores rejected, mas o socket consumindo conexão.

Em **session.guard.ts:39**, `JSON.parse` exception → exception filter NestJS retorna 500 generic. Cliente vê "internal server error" em qualquer rota — pior UX que 401 "sessão expirada, escaneie QR".

**Repro hipotético**:
1. Atacante tem acesso indireto ao Redis (via vazamento `REDIS_URL` ou rede compose exposed por B-NEW-43).
2. `redis-cli -h <host> SET session:<roubado-via-cookie-secure-false-pre-fix-37> '{this is not json'`.
3. Customer legítimo com cookie `session_token=<roubado>` faz `GET /:slug/menu` → 500 silencioso. Toda requisição protegida falha.
4. Operacional: diagnóstico difícil porque log mostra "SyntaxError" sem indicar qual key.

**Fix sugerido**:
```ts
let parsed: SessionData;
try {
  parsed = JSON.parse(data) as SessionData;
} catch {
  this.logger.warn(`Corrupt session cache for token ${token.slice(0, 8)}*** — invalidating`);
  await this.redis.del(`session:${token}`);
  throw new HttpException('Sessao expirada. Escaneie o QR Code novamente.', HttpStatus.UNAUTHORIZED);
}
```

Aplicar em todos 4 sites. Round 9 fix B-NEW-34 já fez isso em `events.gateway.ts:240-243` (`handleJoinSession`) — não estendeu pros outros.

---

## B-NEW-54 · WS gateway CORS hardcoded localhost (P3)

**Severidade**: **P3** (broken em prod).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:66-72`.

```ts
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3003', 'http://localhost:3002'],
    credentials: true,
  },
  namespace: '/',
})
```

**Bug**: `main.ts:11-14` lê `CORS_ORIGINS` env pra HTTP CORS:
```ts
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3003', 'http://localhost:3002'],
  credentials: true,
});
```

Mas WS gateway tem hardcode. Em prod com TLS + domínio (`https://restaurant.com`), HTTP funciona (env honored), WS handshake fails (origin mismatch). Browsers strict CORS retornam erro WS → cliente fica em "reconectando…" sem feedback útil.

Round 7 reportou; round 9 não fixou.

**Fix sugerido**:
```ts
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3003',
      'http://localhost:3002',
    ],
    credentials: true,
  },
  namespace: '/',
})
```

Decorator literal não aceita expressões dynamic em TS — workaround: passar `cors` via `WebSocketGateway` constructor option no module (Nest accepts factory).

---

## B-NEW-55 · WS handshake sem rate-limit (P3)

**Severidade**: **P3** (Redis backpressure via reconnect storm).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:81-151` (handleConnection).

**Bug**: `handleConnection` rejeita conexões sem auth, mas:
- Não throttle por IP / `client.handshake.address`.
- Cliente desconectado pode reconectar imediatamente.
- Cada tentativa faz `redis.get('session:<token>')` (linha 132) — round-trip Redis.

Cenários:
1. Cliente legítimo com network blip flapping → reconnect/s spam Redis.
2. Atacante com 100 sockets paralelos (single-IP) abrindo, falhando auth, re-abrindo → 100 redis.get/s.
3. Botnet com auth tokens vazados → milhares de auth attempts/s.

`RedisService` (round 5 audit) ainda não tem connection pool tunado (`ioredis` default 1 conn). Spam saturates Redis pipeline → `assistant:rate:*`, `customers:identify:*`, `staff:pin_attempts:*` queries lentas.

**Sem `Throttle` decorator do NestJS** em WS handshake (não trivial em socket.io gateway).

**Fix sugerido**:
1. Counter Redis `ws:reconnect:${ip}` incrementado em handleConnection (rejected ou OK), TTL 60s, cap em 30/min.
2. Se `>= cap`, `client.disconnect(true)` imediato sem fazer `redis.get` da session.
3. Long-term: separar Redis pra WS state vs Redis pra rate-limits (segregar saturation domains).

---

## Outras observações (não-achados)

### Round 9 PR cobriu 9 dos 13 achados do round 7

Confirmado:
- B-NEW-33 (HostOrManagerGuard fix) — `host-only.guard.ts:30-66`.
- B-NEW-34 (WS join:session staff cross-tenant) — `events.gateway.ts:225-244`.
- B-NEW-35 (welcome rate-limit) — `customers.controller.ts:200-221, 263-281`.
- B-NEW-36 (WS staffId obrigatório) — `events.gateway.ts:99-122, 295-302`.
- B-NEW-37 (recognition_token secure flag) — `customers.controller.ts:131-141, 283-293, 329-339`.
- B-NEW-26 (WS join:tenant slug check) — `events.gateway.ts:188-196`.
- B-NEW-40 (Mongo init scripts unificados) — não-verificado nesta auditoria mas comentário do controller indica fix.
- B-NEW-44 (staff/my-tables filter por session) — `staff.controller.ts:101-109` (com path-actor branching).
- B-NEW-45 (ai-service fail-CLOSE) — `services/ai-service/main.py:103-134`.

Deferred pra round 10:
- **B-NEW-41** · DB pool size + query logging em dev. Confirmado: `apps/api/src/config/database.config.ts:1-9` ainda sem `extra.max` e `logging: NODE_ENV !== 'production'`.
- **B-NEW-42** · Payments idempotency. Confirmado: `payments.controller.ts:47-67` sem `idempotencyKey` no DTO; `payments.service.ts:99-117` ainda SELECT-then-INSERT TOCTOU.
- **B-NEW-43** · DB ports expostas no docker-compose. Não verificado nesta auditoria.

### Round 9 PR também cobriu items deferred do round 5/6:
- **B-NEW-30** (PIN throttle global por IP) — `staff.controller.ts:35-37, 134-172` adicionou camada IP além do per-staffId.

### `recognize` body fallback ainda existe (low risk)

`customers.controller.ts:319` ainda aceita `dto.recognitionToken ?? cookie`. Round 7 fix removeu o token do response body, atacante precisa OUTRO vetor pra obter o token. Aceitável risco residual.

### Cookies do projeto — auditoria

`session_token` (`table-session.controller.ts:38-44`): `httpOnly, secure: prod, sameSite: lax, maxAge: 4h`. ✓
`recognition_token` (3 sites em `customers.controller.ts`): mesmo flags pós-round-9. ✓

Não há outros cookies emitidos por `apps/api/src`. Consistência OK.

### `assistant.service.sendMessage` rate limit OK

`assistant:rate:${tableSessionId}` cap em N por 4h. Per-session rate-limit existe. Combina com `MAX_MESSAGES_PER_SESSION`. Resistente a per-customer abuse. ✓

### `staff_messages` família ainda parcialmente aberta

`emitStaffMessageRead` foi corrigido pra route `tenant:${slug}` (events.gateway.ts:762-764). Round 8 fix. ✓ B-NEW-38 resolvido.

`StaffMessagesController.send` (staff-messages.controller.ts:62) ainda aceita `dto.senderStaffId` arbitrário — coberto na B-NEW-49.

### Migrations 016, 020, 026, 030, 034 — backfill audit

- 016: ALTER `kind VARCHAR(10) NOT NULL DEFAULT 'food'` em menu_items, `reason VARCHAR(30) NOT NULL DEFAULT 'other'` em waiter_calls. Defaults garantem rows existentes têm valores → safe backfill.
- 020: `is_vip BOOLEAN NOT NULL DEFAULT false` em customers. Safe.
- 026: novas tabelas (CREATE TABLE IF NOT EXISTS) — sem ALTER em existentes. Safe.
- 030: `tool_results JSONB`, `contextual_chips JSONB`, `from_role TEXT`, etc — todos nullable, sem NOT NULL. Safe.
- 034: `steps JSONB NOT NULL DEFAULT '[]'::jsonb` — default fills. Safe.

Todas idempotentes via `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Sem riscos de backfill destrutivo.

### `ChatHistoryService.listMessages` (sem ownership) ainda existe

`chat-history.service.ts:167-183` é método interno, mas público no service class. Atualmente usado por `listMessagesForCustomer` que valida ownership. Risk: outro consumer pode chamar `listMessages` direto sem o wrapper. Refator: tornar privado ou prefixar `_unsafeListMessages`.

### CallerResolverService — bom padrão

`apps/api/src/common/services/caller-resolver.service.ts` (referenciado em vários controllers) parece encapsular bem a resolução cookie → customerId. Padrão sólido pra estender pra staff (ver fix B-NEW-49).

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 (B-NEW-8..18) |
| 5 | 6 | 4 | 3 | 1 | 14 (B-NEW-19..32) |
| 7 | 3 | 4 | 5 | 1 | 13 (B-NEW-33..45) |
| 9 | **0** | **5** | **3** | **2** | **10 (B-NEW-46..55)** |

Densidade de P0 cai pra 0 — sintoma claríssimo de que rounds 4-9 cobriram bem a superfície de role-bypass / IDOR direto. Os achados desta rodada são todos:
- **Famílias-irmãs incompletas** (B-NEW-46, 47, 48, 50): fix aplicado em um endpoint não foi replicado em endpoints simétricos do mesmo padrão.
- **Staff-side ownership** (B-NEW-49): customer-side foi todo coberto round 7-9; staff-side ficou aberto pros mesmos vetores (audit log spoof via `staffId` no body).
- **Concurrency / DoS / robustness** (B-NEW-46, 51, 52, 53, 55): bugs de não-funcionalidade que não eram visíveis em fluxos normais mas aparecem sob stress / atacante.

**Pattern recorrente**: comentários no código afirmam a propriedade (e.g., "Usa Redis SET NX EX") mas a implementação não cumpre. Sugestão: testes unitários focados em concurrency (`fast-check` ou paralelismo manual) cobrem essa classe de bugs.

---

## Recomendação de priorização

**P1 antes do release** (6 P1):
1. **B-NEW-46** · Orders idempotency atomic (Redis SETNX). Afeta double-charging.
2. **B-NEW-47** · order-ratings ownership via JOIN. Afeta PII vazamento.
3. **B-NEW-48** · markVip ManagerOnlyGuard. Afeta role hierarchy.
4. **B-NEW-49** · Staff-side staffId via header (sweep ~8 controllers).
5. **B-NEW-50** · table-merge create cookie ownership.

**P2 backlog** (3):
6. **B-NEW-51** · feedbacks/complaints UNIQUE + idempotency.
7. **B-NEW-52** · menu/search MaxLength + rate-limit.
8. **B-NEW-53** · JSON.parse try/catch em 4 hot paths.

**P3 nice-to-have** (2):
9. **B-NEW-54** · WS gateway CORS env-driven.
10. **B-NEW-55** · WS handshake throttle.

**Round 10 também deve cobrir os 3 deferred pendentes** (B-NEW-41, 42, 43).

---

## Comparação com Rounds 3-7

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| **9** | **0** | **5** | **3** | **2** | **10** |

Round 9 é o primeiro round COM 0 P0 — sweep cumulativo de rounds 4-9 fechou os caminhos de privilege escalation direto. Achados restantes são ownership-side (P1, mas requer atacante na mesa) e concurrency/robustness (P2/P3).

**Convergência**: o backlog total (P0+P1) caiu de 14 (round 5) → 7 (round 7) → 5 (round 9). Sweep continua produtivo mas a curva está achatando — round 10 tem high probability de < 5 achados novos.
