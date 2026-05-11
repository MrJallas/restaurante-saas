# Round 12 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · após PR #36 (round 12 fix dos 4 P1 do round 11).
> Target: descobrir bugs NOVOS pós-merge round 12 e decidir critério de
> encerramento do loop. Sem rodar — só audit estático em apps/api,
> services/ai-service, packages/database/migrations.

## TL;DR

**1 P1 + 4 P2 + 2 P3 · 0 P0.** Convergência **quase atingida**:
round 12 fechou os 4 P1 do round 11 (B-NEW-60..63 confirmados implementados
e wired). Resíduo: 1 IDOR em `staff-messages.listMessagesInThread` —
mesma classe dos fixes B-NEW-9/B-NEW-16 (chat-history) que fechou em round
5, mas a contraparte staff-side (`staff_messages` + `staff_message_thread_participants`)
ficou sem ownership check.

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| 10 | 0 | 2 | 1 | 1 | 4 |
| 11 | 0 | 3 | 1 | 0 | 4 |
| **12** | **0** | **1** | **4** | **2** | **7** |

P0 = 0 pelo quarto round consecutivo. ✓
P1 caiu de 3 → 1 (fix dos B-NEW-60..63 do round 11 confirmado).

**Statement de encerramento**: **NÃO ENCERRA — 1 P1 ativo (B-NEW-64).**
Loop esperado pra fechar em round 13 após fix simples de ~20 min
(JOIN com `staff_message_thread_participants` em listMessagesInThread).

---

## Verificação dos fixes do round 12 (B-NEW-60..63)

Cross-check JSdoc-vs-implementação que round 11 audit recomendou:

### B-NEW-60 (requireActiveStaffId wiring) FECHADO ✓

```
$ grep -n "requireActiveStaffId" apps/api/src/
apps/api/src/common/services/caller-resolver.service.ts:118: async requireActiveStaffId
apps/api/src/modules/complaints/complaints.controller.ts:184: const staffId = await this.callerResolver.requireActiveStaffId(req)
apps/api/src/modules/staff-messages/staff-messages.controller.ts:82,88,104: 3x usage
```

- `complaints.controller.ts:177-185` (`resolve`) usa `requireActiveStaffId` em `@UseGuards(StaffOnlyGuard)` (sem ManagerOnlyGuard que faria DB lookup). ✓
- `staff-messages.controller.ts:76-105` — todos 3 endpoints (`send`, `listThreads`, `markRead`) usam `requireActiveStaffId`. Controller-level `@UseGuards(StaffOnlyGuard)` sem ManagerOnlyGuard. ✓

Outros sites com somente StaffOnlyGuard (sem Manager/Host guard que já fazem DB lookup) — confirmado não-existem casos análogos pendentes:

- `complaints.forward` (StaffOnlyGuard só) — não chama `requireStaffId` nem `requireActiveStaffId`. Service grava `complaints.assigned_manager_id = dto.toStaffId` mas NÃO grava quem chamou. Audit-light por design (escalation chain registra `to_staff`, não `forwarder_staff`). Aceitável — vide observação na seção P2.
- `dashboard.*`, `staff.*`, `late-arrival.list/getById`, `complaints.list`, `lgpd.list`, `vip.list`, `table-merge.list` — read-only, sem audit relevante.
- `delivery.*`, `waiter-calls.acknowledge/resolve`, `qr-issues.*` — não persistem `staff_id` (audit-via-role). Vide observação P3.

### B-NEW-61 (table-merge create source pinning) FECHADO ✓

`table-merge.controller.ts:99-104`:
```ts
if (dto.sourceTableSessionId !== session.sessionId) {
  throw new HttpException('sourceTableSessionId precisa ser sua própria mesa.', HttpStatus.FORBIDDEN);
}
```

JSdoc na linha 86-89 ("sourceTableSessionId pinned no session.sessionId") corresponde à impl. `targetTableSessionId` continua arbitrário do body — by design pra que customer A em mesa 5 possa pedir merge com mesa 7. ✓

### B-NEW-62 (table.participants/decide hostCustomerId from cookie) FECHADO ✓

`table.controller.ts:58-72`:
```ts
const callerCustomerId = await this.callerResolver.requireCustomerId(req);
return this.tableSessionService.decideJoinRequest(
  session.sessionId,
  callerCustomerId,    // ← do cookie, não do body
  dto.targetCustomerId,
  dto.decision,
);
```

DTO ainda tem `hostCustomerId` como `@IsOptional` pra back-compat. Service ignora (controller passa `callerCustomerId` no slot). ✓

Service `decideJoinRequest` (table-session.service.ts:321-362) mantém check `host_customer_id !== requesterCustomerId` — agora `requesterCustomerId` vem do cookie, então só host real (cookie do host real) passa. ✓

### B-NEW-63 (home customerId from cookie) FECHADO ✓

`home.controller.ts:22-31`:
```ts
async getHome(@Session() session: SessionData, @Req() req: Request) {
  const customerId = await this.callerResolver.tryGetCustomerId(req);
  return this.homeService.getHome(session.sessionId, customerId ?? undefined, session.tableLabel);
}
```

`HomeModule` importa `CallerResolverModule` (linha 10). ✓

`tryGetCustomerId` (não `requireCustomerId`) pra que home anônimo (customer scaneou QR mas ainda não fez welcome) continue funcionando — só pula a personalização. Coerente.

---

## Achado novo

## B-NEW-64 · staff-messages.listMessagesInThread sem ownership check (P1)

**Severidade**: **P1** (IDOR — qualquer staff com `x-staff-key` lê mensagens de threads alheios).

**Source**:
- `apps/api/src/modules/staff-messages/staff-messages.controller.ts:92-95`
- `apps/api/src/modules/staff-messages/staff-messages.service.ts:139-147`

**Controller**:
```ts
@Get('threads/:threadId')
async listMessages(@Param('threadId') threadId: string) {
  return this.service.listMessagesInThread(threadId);   // ← sem caller staffId
}
```

**Service**:
```ts
async listMessagesInThread(threadId: string) {
  const rows = (await this.tenantConn.query(
    `SELECT * FROM staff_messages
      WHERE thread_id = $1 AND deleted_at IS NULL
      ORDER BY sent_at ASC LIMIT 500`,
    [threadId],
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => this.mapMessageRow(r, threadId));
}
```

**Bug**: o service NÃO valida que o caller é participante da thread. `staff_message_thread_participants` table existe (migration 027:57-65) e `listThreadsForStaff` (linha 113-128) já faz JOIN com ela. Mas `listMessagesInThread` faz `SELECT * FROM staff_messages WHERE thread_id = $1` direto — qualquer threadId conhecido retorna 500 últimas mensagens.

**Vetor de leak do threadId**:
1. **WS event broadcast (vetor primário)**: `events.gateway.ts:744-757::emitStaffMessageReceived` faz `this.server.to(\`tenant:${slug}\`).emit('staff_message.received', payload)`. Payload inclui `payload.message.threadId` (staff-messages.service.ts:95). Qualquer staff conectado ao WS do tenant recebe TODOS threadIds em tempo real.
2. **Self-listing**: `GET /:slug/staff-messages/threads` retorna threadIds dos seus, mas via WS atacante coleta threadIds de TODOS.
3. **DB introspection**: se atacante chega a DB read-only via outra vulnerabilidade, threadIds são triviais.

**Repro**:
1. Staff M (manager) DM staff W (waiter): "Reclama da W4 demais, vou demitir mês que vem". Thread T1 entre M, W.
2. Staff X (cook waiter) com `x-staff-key` shared, conectado ao WS do tenant. Recebe `staff_message.received` payload contendo `threadId: T1` (mesmo sem participar).
3. X faz `GET /:slug/staff-messages/threads/T1` com `x-staff-key` (válido). Service retorna 500 mensagens da thread.
4. X lê toda a conversa privada manager→waiter. PII de **3a pessoa** (W). Possível phishing/SE/blackmail.

**Variação**: thread broadcast (`is_broadcast = true`) tem múltiplos participants. Atacante X que NÃO é participante de uma thread broadcast escalar (ex.: M→hosts only) ainda lê.

**Comparar com fix correto em chat-history.service**:
- `chat-history.controller.ts:78-85` chama `listMessagesForCustomer(threadId, customerId)`.
- `chat-history.service.ts:192-201` faz check: `if (!thread || thread.customerId !== customerId) throw 404`.
- Mesma estrutura aplicável aqui — só a pesquisa em `staff_message_thread_participants` em vez de check direto de campo.

**Comparar com round 11 audit "outras observações"**: round 11 audit recomendou cross-check JSdoc vs impl porque B-NEW-60 era fix-declarado-não-implementado. Aqui é o oposto: nem JSdoc reclama o intent, nem impl tem o check.

**Família ancestral**:
- B-NEW-9 (chat-history listMessages) — round 5 fixou ownership check.
- B-NEW-16 (Mongo chat-history determinístico threadId) — round 5 fixou.
- B-NEW-57 (assistant.history customerId) — round 11 fixou.
- **B-NEW-64 (staff-messages listMessages staffId)** — staff-side counterpart NUNCA auditado.

**Severidade P1 não-P2** porque:
- PII relevante (DMs entre staff podem mencionar customer real, audit, demissão, salário).
- Vetor de leak (`threadId` via WS broadcast `tenant:${slug}`) é trivial — não precisa social engineer threadId.
- Escala: 1 atacante staff lê TODOS os threads do tenant em poucos requests.
- Audit log: `read_at` continua null (markRead exige caller-as-recipient, é validado), então atacante "vê sem deixar rastro".

**Fix sugerido** (~20 min — pattern já implementado em chat-history):

```ts
// staff-messages.controller.ts:92-95
@Get('threads/:threadId')
async listMessages(
  @Param('threadId') threadId: string,
  @Req() req: Request,
) {
  const staffId = await this.callerResolver.requireActiveStaffId(req);
  return this.service.listMessagesInThread(threadId, staffId);
}

// staff-messages.service.ts:139
async listMessagesInThread(threadId: string, callerStaffId: string) {
  // Cross-check: caller é participante da thread.
  const participantRows = (await this.tenantConn.query(
    `SELECT 1 FROM staff_message_thread_participants
       WHERE thread_id = $1 AND staff_id = $2 AND left_at IS NULL LIMIT 1`,
    [threadId, callerStaffId],
  )) as unknown[];
  if (!participantRows.length) {
    throw new HttpException('Thread não encontrada.', HttpStatus.NOT_FOUND);
  }
  // ... resto igual
}
```

Pattern: 404 sem distinguir "não existe" de "não é participante" — não vaza existência.

---

## Outras observações (não-achados, P2 backlog)

### B-NEW-65 (P2) · WS `join:customer` falha silenciosa pra customer sockets

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:264-285` + `apps/api/src/modules/table-session/table-session.service.ts:131-148`.

`SessionData` payload em Redis (table-session.service.ts:135-141) inclui apenas `{sessionId, tableId, tableCode, tableLabel, schemaName}`. Não inclui `customerId`. Mas `events.gateway.handleConnection` (linha 140-148) tenta ler `session.customerId` do Redis pra carimbar `client.data.customerId` — sempre undefined.

`handleJoinCustomer` (linha 264-285) compara `client.data.customerId !== data.customerId` → undefined !== UUID → falha sempre com `error: 'Customer mismatch'`.

**Impacto funcional**:
- Customer FE (`apps/web-customer/src/hooks/useCustomerHostEvents.ts:97-99`) emite `join:customer` que sempre falha.
- Eventos roteados APENAS pra `customer:<id>` não chegam:
  - `late_arrival.created` (events.gateway.ts:491-505) — host customer não recebe popup em tempo real.
- Eventos dual-routed (`customer:<id>` + `session:<id>`) chegam via session room ✓:
  - `late_arrival.approved/rejected/expired`, `table_merge.created/approved/rejected`, `complaint.responded/resolved`, `escalation.completed`.

**Único evento afetado em produção**: `late_arrival.created` na UI do host. Host vai precisar de polling REST de `GET /:slug/late-arrival-requests` (já existe — usado como fallback) pra ver novos pedidos.

**Severidade P2 não-P1** porque:
- Não é leak (atacante não ganha acesso, só falha em entrar em room dele mesmo).
- Único evento afetado tem fallback REST existente — UX degradada não bloqueada.
- Bug pre-existente desde a primeira versão do WS gateway (rounds 4-12 não introduziram).

**Fix sugerido** (~15 min):

Atualizar Redis session payload em `customers.welcome/recognize/identify` quando customer se identifica:

```ts
// table-session.service.ts: novo método público
async setCustomerIdInSession(sessionId: string, customerId: string) {
  const data = await this.redis.get(`session:${sessionId}`);
  if (!data) return;
  const session = JSON.parse(data);
  session.customerId = customerId;
  await this.redis.set(`session:${sessionId}`, JSON.stringify(session), SESSION_TTL_SECONDS);
}

// customers.controller.ts welcome/recognize após cookie set:
await this.tableSessionService.setCustomerIdInSession(session.sessionId, result.customerId);
```

Alternativa simpler: rotear `late_arrival.created` ALSO pra `session:<hostSessionId>` (host está naturalmente na room).

### B-NEW-66 (P2) · complaints.forward sem audit de quem chamou

**Source**: `apps/api/src/modules/complaints/complaints.controller.ts:188-196` + `apps/api/src/modules/complaints/complaints.service.ts:228-340`.

`forward` aceita `dto.toStaffId` como destinatário, mas não captura `caller staffId`. Service grava `assigned_manager_id = toStaffId` (substitui anterior) e cria escalation chain step com `current_assignee_staff_id = toStaffId`. Não há campo `forwarded_by_staff_id` no schema.

**Impacto**:
- Audit log: manager M investigando vê complaint reassinada, mas não sabe quem reassignou (pode ser M anterior ou outro staff).
- Vetor manipulação: waiter W (com `x-staff-key`) faz `POST /:slug/complaints/:id/forward {toStaffId: <manager-rixoso-uuid>}`. Manager X recebe complaint que não devia, gerando atrito.
- StaffOnlyGuard sem ManagerOnlyGuard — qualquer staff (waiter/cook) pode forward (não só manager).

**Severidade P2 não-P1** porque:
- Audit-light por design (forward é operacional, escalation chain mantém histórico do level).
- Sem leak de PII (mesmo manager X que recebe forward já vê o complaint normal).
- ManagerOnlyGuard adicional + `requireActiveStaffId` capturando caller seriam consistente com `respond`/`resolve` — mas não-bloqueador.

**Fix sugerido** (~30 min):
1. Migration 040: `ALTER TABLE escalation_chains ADD COLUMN forwarded_by_staff_id UUID REFERENCES staff(id)`.
2. Trocar guard pra `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)` — só manager pode forward.
3. Capturar `staffId = await this.callerResolver.requireActiveStaffId(req)` e passar no service.

### B-NEW-67 (P2) · waiter-calls.acknowledgeCall aceita staffName arbitrário

**Source**: `apps/api/src/modules/waiter-calls/waiter-calls.controller.ts:126-139` + `apps/api/src/modules/waiter-calls/waiter-calls.service.ts:194-245`.

`AcknowledgeCallDto.waiterName` é `@IsString @MaxLength(60) @IsOptional`. Service grava direto em `waiter_calls.assigned_waiter_name`. Customer UI mostra "Roberto está a caminho - 3 min".

**Vetor**: waiter W com `x-staff-key` faz `POST /:slug/waiter-calls/:callId/acknowledge {waiterName: 'Roberto'}` enquanto Roberto está em outro turno. Customer recebe nome falso, espera "Roberto" — quando outro chega, conflito de identidade.

**Severidade P2 não-P1** porque:
- StaffOnlyGuard restringe acesso (só staff autenticado).
- Impacto operacional/UX, não exfiltração ou audit corruption real (caller staff_id não é gravado no schema, então não tem audit pra spoofar).
- Fix correto requer trocar `dto.waiterName` por DB lookup `SELECT name FROM staff WHERE id = $1` baseado em `x-staff-id` header.

**Fix sugerido** (~30 min):
```ts
const staffId = await this.callerResolver.requireActiveStaffId(req);
const staffName = (await this.tenantConn.query(
  'SELECT name FROM staff WHERE id = $1', [staffId]
))[0]?.name;
return this.service.acknowledgeCall(callId, slug, staffName, dto.etaMinutes);
```

### Aliases AI service stale (P2 — quality, não security)

Tools `late_arrival_request.py:25`, `lgpd_data_request.py:47`, `request_table_merge.py:36`, `delete_chat.py:35-37` chamam paths defasados:

- `/customer/late-arrivals` → controller real é `/:slug/late-arrival-requests`.
- `/customer/lgpd-requests` → real é `/:slug/lgpd-requests`.
- `/{tenant_id}/table-merge-requests` com body `{originTableSessionId, targetTableLabel, requestingCustomerId}` → DTO atual exige `sourceTableSessionId` e `targetTableSessionId` (UUIDs).
- `/{tenant_id}/chat-history/threads/{thread_id}?customerId={customer_id}` → controller agora deriva customerId do cookie (round 5 B-NEW-9), customerId em query é IGNORADO; e `api_client` não envia cookies.

**Impacto**: tools chamadas pelo LLM falham silenciosamente em prod (api_client retorna 400/404 → ToolResult.error). Customer vê "Erro" no bubble. Quality/UX, não security.

P2 backlog — fix requer revisar todos os tools side-effect-mutating pra alinhar com schemas atuais + adicionar `recognition_token` cookie no `api_client.headers`.

### qr-issues GET sem guard (P3)

`qr-issues.controller.ts:48-50` `@Get` retorna `[]` (stub). Mesmo se eventualmente persistir QR issues (description, photo URL), o endpoint precisa StaffOnlyGuard. Stub aceitável por enquanto — mas worth tracking.

### Backlog P2/P3 conhecido (continuam abertos pós round 12)

- **B-NEW-41** (P2): DB pool size + remove query logging em prod (`config/database.config.ts:5`).
- **B-NEW-51** (P2): feedbacks/complaints idempotency (TOCTOU em SELECT-then-INSERT).
- **B-NEW-52** (P2): menu/search rate-limit + cap query length (ILIKE com `%${query}%` parametrizado, sem rate-limit).
- **B-NEW-53** (P2): JSON.parse defense em 5 hot paths (`session.guard.ts:39`, `staff-or-session.guard.ts:76`, `events.gateway.ts:140`, `events.gateway.ts:238`, `orders.service.ts:110`, `table-session.service.ts:173`).
- **B-NEW-55** (P3): WS handshake rate-limit per IP.
- **B-NEW-59** (P3): test coverage gaps.

---

## Observações sobre fixes recentes (regression check)

### CallerResolverService.requireActiveStaffId — schema correto ✓

`TenantConnectionProvider` é request-scoped → roda no schema do tenant carimbado pelo `tenant.middleware.ts:49-57`. `requireActiveStaffId` (caller-resolver.service.ts:118-131) chama `this.tenantConn.query(SELECT 1 FROM staff WHERE id = $1 AND is_active = true)` — schema correto. ✓

Verificado também `complaints.controller.ts` e `staff-messages.controller.ts` injetam `CallerResolverService` via DI, e ambos modules importam `CallerResolverModule`:

```
$ grep -n "CallerResolverModule" apps/api/src/modules/staff-messages/staff-messages.module.ts \
                                  apps/api/src/modules/complaints/complaints.module.ts
apps/api/src/modules/staff-messages/staff-messages.module.ts:5:import { CallerResolverModule } from '../../common/services/caller-resolver.module';
apps/api/src/modules/staff-messages/staff-messages.module.ts:11:  imports: [TenantModule, CallerResolverModule, WebsocketModule],
apps/api/src/modules/complaints/complaints.module.ts:5:import { CallerResolverModule } from '../../common/services/caller-resolver.module';
apps/api/src/modules/complaints/complaints.module.ts:14:  imports: [TenantModule, CallerResolverModule, WebsocketModule],
```

### table-merge.create source pinning — sem regressão ✓

DTO `CreateMergeDto.requestingCustomerId` permanece `@IsUUID` (deprecated, ignorado). Body pré-existente continua passando, just `requestingCustomerId` é overridden pelo cookie. FE legítimo (`apps/web-customer/src/hooks/...`) não foi alterado — funciona identicamente.

`session.sessionId` (do `@Session` decorator) é a única source-of-truth. Validação `dto.sourceTableSessionId !== session.sessionId` dispara 403 forbidden em vez de criar request — comportamento explícito.

### table.participants/decide — service preserva semantics

`table-session.service.ts:321-362` mantém check `host_customer_id !== requesterCustomerId`. Como round 12 passou `callerCustomerId` (cookie-derived) no slot, a comparação agora é cookie-vs-DB-host. Atacante (não-host) na mesma session passa, mas o cookie dele resolve pra customerId-A, e DB tem `host_customer_id = H-uuid` ≠ A → 403. ✓

### home.getHome — sem regressão pra customer anônimo

`tryGetCustomerId` (não `requireCustomerId`) → quando cookie ausente (customer scaneou QR mas ainda não fez welcome), `customerId = null`, `getHome` chama com `customerId: undefined` → home renderiza `nome = 'visitante'` template, sem PII. ✓

### Migrations 040+ — não há

Sequência continua em 039. Round 12 não adicionou migrations.

### B-NEW-58 (late-arrival tableSessionId) ainda fechado ✓

`late-arrival.controller.ts:180`: `tableSessionId: session.sessionId` continua hard-coded.

### WS gateway — auth handshake correto exceto B-NEW-65

Staff: `x-staff-id` obrigatório no handshake (round 9 B-NEW-36). `x-tenant-slug` carimba `client.data.staffTenantSlug`. join:tenant/session/staff/manager validam matches. ✓

Customer: `session_token` resolved via Redis. **Mas Redis session payload não inclui customerId** → `client.data.customerId` sempre undefined → join:customer falha (B-NEW-65). Pre-existente, P2.

### Cookie consistency — limpa

`session_token` (table-session.controller.ts:38-44) + `recognition_token` (3 sites em customers.controller.ts) — todos `httpOnly + secure(prod) + sameSite=lax`. ✓

### Idempotency — orders ✓ payments ✓ outros pendentes

- orders.create: Redis SETNX atomic (round 10). ✓
- payments.requestPayment: SETNX lock + try/finally (round 11). ✓
- waiter-calls.create: UNIQUE em (table_session_id, status='pending') (migration 014). ✓
- complaints.create / feedbacks.submit: ainda sem dedup (P2 backlog B-NEW-51).
- late-arrival.create / staff-messages.send / lgpd.create: sem dedup (P3 — UX irritante mas não crítico).

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| 10 | 0 | 2 | 1 | 1 | 4 |
| 11 | 0 | 3 | 1 | 0 | 4 |
| **12** | **0** | **1** | **4** | **2** | **7** |

**Trajetória de convergência**:
- P0 = 0 pelo 4o round consecutivo.
- P1: 5 → 2 → 3 → **1** — dropou após fix dos B-NEW-60..63.
- P2/P3 estável (backlog).

**Categorização do 1 P1 (B-NEW-64)**:
- IDOR clássico — staff lê thread alheio sem cross-check `staff_message_thread_participants`.
- Família de B-NEW-9/B-NEW-16 (chat-history customer-side) que round 5 já fixou. Counterpart staff-side ficou — primeira vez auditado.
- Não é regressão, não é fix-declarado-não-implementado: é gap genuíno.

---

## Recomendação de priorização

**P1 imediato** (1 P1):
1. **B-NEW-64** · `staff-messages.listMessages` cross-check participantship via JOIN `staff_message_thread_participants`. Custo: ~20 min.

**P2 backlog** (4 P2 novos + 5 ancestrais):
- B-NEW-41 (DB pool + logging)
- B-NEW-51 (feedbacks/complaints UNIQUE + dedup)
- B-NEW-52 (menu/search rate limit + cap)
- B-NEW-53 (JSON.parse try/catch — 5 sites)
- B-NEW-55 (WS handshake throttle)
- **B-NEW-65** (WS join:customer customerId não carimbado em Redis session) — fix simples (15 min) ou refactor (rotear `late_arrival.created` pra session room)
- **B-NEW-66** (complaints.forward sem audit de caller + ManagerOnlyGuard) — 30 min
- **B-NEW-67** (waiter-calls.acknowledge waiterName arbitrário) — 30 min
- **AI service stale paths** (4 tools com path/body desatualizado) — 1-2h pra revisar todos os tools

**P3** (2 issues):
- qr-issues.GET sem guard (cosmetic)
- B-NEW-59 (test coverage gaps)

**Total Round 13 P1 fix**: ~20 min.

---

## Critério de encerramento

Trend visualizada:

```
Round  P0  P1  P2  P3  Total
  3     0   1   4   2    7
  4     3   2   3   1   11
  5     6   4   3   1   14
  7     3   4   5   1   13
  9     0   5   3   2   10
 10     0   2   1   1    4
 11     0   3   1   0    4   ← regression: fix declarado-não-implementado
 12     0   1   4   2    7   ← P1 dropou de 3 → 1, P2 subiu por gaps em famílias-staff
```

**P1 caiu drasticamente** — round 12 fechou 4 P1 do round 11 sem regressão. Único P1 ativo é uma família ancestral nunca auditada antes.

**Loop NÃO ENCERRA — 1 P1 ativo (B-NEW-64).**

Round 13 com fix B-NEW-64 (~20 min) deve retornar 0 P0/P1, encerrando o loop.

Recomendações pra round 13:
1. Fix B-NEW-64 (staff-messages IDOR).
2. Re-audit cumulativo cobrindo:
   - Sweep final de todos endpoints com `@Get('threads/:threadId')`-like patterns sem ownership.
   - Verificar se há eventos WS adicionais que misroteam pra `customer:<id>` only sem session fallback.
3. Confirmar contagem 0 P0/P1 → ENCERRAR.

Backlog P2/P3 (atualmente 9 itens) pode virar issues separadas pra próximas sprints — não bloqueia release pós-round-13.

---

## Observações sobre regressões dos fixes recentes

### Round 12 fixes não introduziram nenhum bug novo

Verificado em `git diff main..HEAD`:
- `apps/api/src/modules/complaints/complaints.controller.ts` — apenas troca de método. Sem side-effects.
- `apps/api/src/modules/staff-messages/staff-messages.controller.ts` — 3 trocas. Sem side-effects.
- `apps/api/src/modules/table-merge/table-merge.controller.ts` — adicionado check `dto.sourceTableSessionId !== session.sessionId`. FE legítimo (apps/web-customer) não foi alterado — observado uso `originTableSessionId` em AI tool stale (B-NEW-XX backlog) mas não é fluxo legítimo.
- `apps/api/src/modules/table-session/table.controller.ts` — `dto.hostCustomerId` agora é `@IsOptional`. Body legacy continua passando, valor é ignorado.
- `apps/api/src/modules/home/home.controller.ts` — query `?customerId=` não usado mais. Customer FE precisa atualizar pra **não** passar query param (cookie é único source-of-truth) — mas service ignora se passado, sem 400.

### CallerResolverService schema injection — confirmed safe

`requireActiveStaffId` faz `this.tenantConn.query(...)` que usa request-scoped `TenantConnectionProvider`. Schema correto via `tenant.middleware.ts:49-57`. Sem cross-tenant leak.

### Fail-modes em B-NEW-61 (table-merge create)

Atacante passa `dto.sourceTableSessionId !== session.sessionId` → 403 ForbiddenException. UI legítimo nunca encontra essa condição (FE sempre lê `session.sessionId` do cookie/localStorage e passa o mesmo no body). ✓

### Fail-modes em B-NEW-62 (table.participants/decide)

Atacante na mesma session-token (mas non-host) faz request → service compara cookie-customerId (A) vs DB host_customer_id (H) → throw `ForbiddenException('Apenas o host da mesa...')`. ✓

### Fail-modes em B-NEW-63 (home customerId)

Customer anônimo (sem cookie recognition_token) → `tryGetCustomerId` returns null → home renderiza com `nome = 'visitante'` placeholder. Customer identificado → home renderiza com nome dele e summary dele. Cross-customer leak impossível — não há mais query param pra exploit. ✓

---

## Conclusão

Round 12 traz 1 P1 + 4 P2 + 2 P3 — **densidade de findings novos despencou** comparado a rounds anteriores. Os 4 P1 do round 11 foram fechados sem regressão. Único P1 ativo é uma família ancestral (chat-history-style ownership) que nunca foi auditada para o lado staff.

**Custo Round 13**: ~20 min (B-NEW-64 fix com pattern já estabelecido em chat-history.service).

**Loop NÃO ENCERRA neste round** — 1 P1 ativo. Próximo round com fix simples deverá retornar 0 P0/P1 e fechar o loop.

Backlog P2/P3 (9 itens) pode virar issues separadas pra próximas sprints. Nenhum item P2/P3 bloqueia release pós-round-13.
