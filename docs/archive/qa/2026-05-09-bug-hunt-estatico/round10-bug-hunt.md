# Round 10 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes do PR Round 10 (B-NEW-46/47/48/49 sweep parcial/50/43/54).
> Target: descobrir bugs NOVOS pós PR round 10. Foco em famílias-irmãs incompletas
> e leaks que sobreviveram aos rounds 4-10. Sem rodar — só audit estático.

## TL;DR

**4 achados novos · 2 P1 · 1 P2 · 1 P3.** Trend confirmado: convergência detectável.

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| **10** | **0** | **2** | **1** | **1** | **4** |

- **B-NEW-56 (P1)**: B-NEW-49 sweep INCOMPLETO. Round 10 cobriu 5 controllers, mas (a) **host module** (host.controller.ts/host.service.ts:454-841) ainda usa `body.staffId` em 5 sites: createSwapRequest (linha 454), updateSwapRequest (linha 481-697), liberateTable (linha 304-368), toggleVip (linha 609-697), createReservation (linha 792-837). DTOs em host.dto.ts ainda têm `staffId?: @IsUUID()`. (b) **CallerResolverService.requireStaffId NÃO valida** is_active no DB nem que o staff existe — só valida shape UUID. Endpoints com somente `StaffOnlyGuard` (sem `ManagerOnlyGuard`/`HostOrManagerGuard`) propagam o spoofing: `complaints.resolve` (controller:170-180), `staff-messages.send` + `listThreads` + `markRead` (controller:72-102). Atacante (waiter com `x-staff-key`) pode passar QUALQUER UUID em `x-staff-id` — incluindo UUIDs de staff fired (is_active=false) ou inexistentes — e o audit log persiste o UUID sem cross-check.
- **B-NEW-57 (P1)**: `GET /:slug/assistant/history?customerId=<UUID>` (assistant.controller.ts:48-69 + assistant.service.ts:398-435) sem ownership check. SessionGuard valida só que o caller tem session. `getHistoryWithToolCalls(tableSessionId, customerId)` faz `WHERE table_session_id = $1 AND customer_id = $2` — se A e B estão na mesma mesa (mesmo tableSessionId, comum em bill_mode=individual), A passa B's customerId (vaza via `GET /:slug/table/participants` que retorna UUIDs) e LÊ a conversa de B com o assistant. Comentário no service (linha 222-225) explicitamente proíbe ("cliente B nao pode ver historico de A") mas só `sendMessage` valida participants — `getHistoryWithToolCalls` ficou sem o check. **Mesma família B-NEW-16 (chat-history threads) que round 5 fixou pra Mongo, não replicou pro Postgres-based assistant_messages**.
- **B-NEW-58 (P2)**: `late-arrival.create` (late-arrival.controller.ts:154-182) aceita `dto.tableSessionId` arbitrário do body — `tableSessionId: dto.tableSessionId ?? session.sessionId`. Customer A em mesa 5 manda `dto.tableSessionId = <mesa-7-id>` → late-arrival gravado em mesa 7 atribuído a A. Mesa 7 host recebe modal "alguém vai chegar atrasado" que ele não esperava. **Mesma família B-NEW-50** (table-merge create) que round 10 fixou. A `:id/approve` e `:id/reject` (round 6 fix B-NEW-12) já usam ownership cookie-derived; só a `create` ficou aberta.
- **B-NEW-59 (P3)**: `apps/api` tem **APENAS 1 arquivo `.spec.ts`** (`apps/api/src/modules/tenant/query-utils.spec.ts`). Services críticos com lógica de concurrency (orders.service SETNX flow, payments.service TOCTOU, table-session.service participants race, customers.service welcome rotation) **sem nenhum teste unitário**. ai-service tem 8 test files / 88 specs (round 7 audit). Lacuna de coverage é a causa raiz de bugs como B-NEW-46 (orders SETNX) e B-NEW-1 (complaints CAS) — testes de concurrency teriam pego.

Detalhes abaixo.

---

## B-NEW-56 · staffId sweep incompleto (host DTOs + non-Manager endpoints) (P1)

**Severidade**: **P1** (audit log spoof — mesmas implicações do B-NEW-49).

**Sources**:

### 56a. Host module ainda lendo `body.staffId`

`apps/api/src/modules/host/dto/host.dto.ts:14-150` define `staffId?: @IsUUID()` opcional em:
- `LiberateTableDto` (linha 26)
- `CreateSwapDto` (linha 51)
- `UpdateSwapDto` (linha 65)
- `ToggleVipDto` (linha 81)
- `CreateReservationDto` (linha 149)

`apps/api/src/modules/host/host.controller.ts` passa o body inteiro ao service sem extrair staffId via header:

```ts
@Post('tables/:tableNumber/liberate')
async liberate(@Body() body: LiberateTableDto, ...) {
  return this.service.liberateTable(tableNumber, body, slug);  // body.staffId direto
}

@Post('swap-requests')
async createSwap(@Body() body: CreateSwapDto, ...) {
  return this.service.createSwapRequest(body, slug);
}

@Post('tables/swap')
async legacySwap(@Body() body: CreateSwapDto, ...) {
  // ... usa body.staffId em update:
  await this.service.updateSwapRequest(created.id, { status: 'completed', staffId: body.staffId }, slug);
}
```

`apps/api/src/modules/host/host.service.ts` grava `body.staffId` em 5 sites:
- linha 368 (`liberateTable`): `by: { staffId: body.staffId ?? null }` em payload de `emitHostTableLiberated`.
- linha 454 (`createSwapRequest`): `INSERT INTO table_swap_requests (... requested_by_staff_id ...) VALUES (... $4 ...)` com `body.staffId ?? null`.
- linha 468: `requestedBy: body.staffId ?? null` no WS event.
- linha 641 (`toggleVip`): `INSERT INTO session_flags (..., set_by_staff_id, ...) VALUES (..., $3, ...)` com `body.staffId`.
- linha 663: `cleared_by_staff_id = COALESCE($2, ...)` com `body.staffId`.
- linha 690-697: payload WS pra `emitHostVipFlagged`.
- linha 837 (`createReservation`): `INSERT INTO reservations (..., created_by_staff_id) VALUES (..., $7)` com `body.staffId`.

**Bug**: Manager M faz `POST /:slug/host/tables/14/liberate -d '{"mode":"manual_force","staffId":"<W-uuid>"}'`. `HostOrManagerGuard` valida `x-staff-id: <M-uuid>` ✓ no DB (M tem role manager) ✓. Mas o service grava `host_table_liberated` com `staffId: <W-uuid>` (waiter). Audit posterior: gerente investigando vê W como autor da liberação.

Round 10 commit message AUTO-RECONHECE: "Host DTOs (swap/liberate/reservation) deferred pra round 11 — escopo separado". Confirmado deferred mas mantém severidade P1 (impacto operacional real).

### 56b. CallerResolverService.requireStaffId NÃO cross-checka DB

`apps/api/src/common/services/caller-resolver.service.ts:82-103`:
```ts
requireStaffId(req: Request): string {
  const headerVal = headers['x-staff-id'];
  const staffId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!staffId || typeof staffId !== 'string') throw 401;
  if (!/^[0-9a-f]{8}-...UUID-regex.../.test(staffId)) throw 401;
  return staffId;   // ← retorna sem validar is_active ou existência no DB
}
```

`ManagerOnlyGuard` (manager-only.guard.ts) e `HostOrManagerGuard` (host-only.guard.ts:52-66) FAZEM `SELECT role FROM staff WHERE id = $1 AND is_active = true`. Mas `StaffOnlyGuard` apenas valida `x-staff-key` shared secret (staff-only.guard.ts) — não toca em `x-staff-id` nenhum.

Endpoints atualmente usando `requireStaffId` SEM `ManagerOnlyGuard`/`HostOrManagerGuard`:
- `complaints.controller.ts:170-180` (`@Post(':id/resolve')` com apenas `@UseGuards(StaffOnlyGuard)`).
- `staff-messages.controller.ts:60-102` — TODOS os endpoints (`@Controller(':slug/staff-messages') @UseGuards(StaffOnlyGuard)` apenas — controller-level guard).

**Repro hipotético**:
1. Atacante é waiter com `x-staff-key` válido (compartilhado) e `x-staff-id: <waiter-W-uuid>` (válido no DB).
2. Curl: `POST /:slug/complaints/<id>/resolve -H 'x-staff-key: ...' -H 'x-staff-id: 00000000-0000-0000-0000-000000000000' -d '{}'`.
3. `StaffOnlyGuard` passa (key OK). `requireStaffId` retorna `00000000-0000-0000-0000-000000000000` (UUID válido em shape). Service grava `resolved_by_staff_id = 00000000-...`.
4. Audit log mostra "complaint resolvida por staff `00000000-...`" — UUID inexistente no DB. Manager investigando pensa que é bug de DB ou orphan reference.
5. Variação: atacante passa UUID de manager M-uuid (que é manager mas hoje fora de turno). Audit log mostra "M resolveu complaint X em horário Y", quando M não fez nada.

**Comparar**: O fix do round 10 moveu de `body.staffId` pra `header[x-staff-id]` mas **deslocou o problema** — a header continua client-controlled em controllers que não têm Manager guard. Defesa em depth: `requireStaffId` deveria fazer SELECT DB pra cross-check, igual `ManagerOnlyGuard`.

**Fix sugerido**:
1. `requireStaffId` ganha lookup DB (via `TenantConnectionProvider` — adicionar dep no service): `SELECT 1 FROM staff WHERE id = $1 AND is_active = true LIMIT 1`. Throw 403 se 0 rows.
2. Aplicar mesma fix pra `complaints.respond/resolve` (já tem `requireStaffId`, mas precisa compor com `ManagerOnlyGuard` se a action é restrita a manager — comentário do controller diz "respond" requer manager mas resolve só staff. Confirmar canon).
3. Host DTOs: replicar pattern do round 10 fix (vip/zone-pause/staff-messages) — adicionar `@UseGuards(StaffOnlyGuard, HostOrManagerGuard)` nos hosts e usar `callerResolver.requireStaffId(req)` em vez de `body.staffId`. 1 sweep cobre 5 controllers.

---

## B-NEW-57 · GET /assistant/history sem ownership check (P1)

**Severidade**: **P1** (IDOR · vaza chat history customer-to-customer same session).

**Source**:
- `apps/api/src/modules/assistant/assistant.controller.ts:48-69`.
- `apps/api/src/modules/assistant/assistant.service.ts:398-435`.

Controller:
```ts
@Get('history')
@UseGuards(SessionGuard)
async getHistory(
  @Session() session: SessionData,
  @Query('customerId') customerId?: string,
) {
  const history = await this.assistantService.getHistoryWithToolCalls(
    session.sessionId,
    customerId || null,    // ← passa direto sem validar ownership
  );
  return { messages: history };
}
```

Service:
```ts
async getHistoryWithToolCalls(tableSessionId: string, customerId: string | null = null) {
  const rows = await this.tenantConn.query(
    `SELECT user_message, assistant_response, tool_calls
     FROM assistant_messages
     WHERE table_session_id = $1
       AND was_blocked = false
       AND (
         ($2::uuid IS NOT NULL AND customer_id = $2)
         OR ($2::uuid IS NULL AND customer_id IS NULL)
       )
     ORDER BY created_at DESC LIMIT 10`,
    [tableSessionId, customerId],
  );
  // ... retorna 10 últimas trocas
}
```

**Bug**: `getHistoryWithToolCalls` filtra por `table_session_id` (do cookie) e `customer_id` (do query string sem validar). Se customer A e customer B estão na MESMA `table_session_id` (mesma mesa física, comum em mesa shared), A passa `?customerId=<B-uuid>` e recebe as 10 últimas mensagens de B com o assistant. Cobrindo:
- `user_message` (texto livre customer escreveu).
- `assistant_response` (resposta do AI — pode incluir nome do customer).
- `tool_calls` JSONB (com itens do menu, totals, decisões de pedido).

**Vetor de leak do customerId**: `GET /:slug/table/participants` (table.controller.ts:30-37) retorna ARRAY com `customerId, name, color, status, isHost` de todos os participantes da sessão. Customer A logado com session válida lê a lista, escolhe a UUID de outro participante, faz a query — leaks chat livre.

Comentário em `assistant.service.ts:222-225` (em `sendMessage`):
> "Cliente B nao pode ver historico de A. Antes vazava (P1-B). Se o cliente nao mandar (ex.: ainda no welcome), retornamos so as mensagens anonimas (customer_id IS NULL)."

Mas o IDOR check só está em `sendMessage` (linhas 195-205, validação contra `session_participants`). `getHistoryWithToolCalls` ficou SEM esse check.

**Comparar com B-NEW-16** (round 5 fix em chat-history Mongo): `listMessagesForCustomer(threadId, customerId)` faz cross-check `thread.customerId === customerId`. Mesma arquitetura faltando aqui pro Postgres-based `assistant_messages`.

**Repro hipotético**:
1. Customer A em mesa 5 (sessionId = X, recognition_token cookie). Customer B também em mesa 5 (mesmo X, separado por billing_mode=individual).
2. A faz `GET /:slug/table/participants` → lista inclui `{customerId: <B-uuid>, name: 'João', ...}`.
3. A faz `GET /:slug/assistant/history?customerId=<B-uuid>` → recebe últimas 10 trocas de B com o assistant. B pode ter perguntado "tem prato sem glúten?" → A vê informação de saúde (alergia) — LGPD-relevant.
4. Pior: B usou tool de pedido que apareceu em `tool_calls` — A vê totais de B sem ter direito a ver split.

**Severidade P1** mesmo vetor sendo "intra-mesa" porque (a) a UI de fato exibe outros participantes da mesa (vetor não-trivial mas natural), (b) PII de saúde / consumo é LGPD, (c) comentário no código JÁ proíbe (intent canon) — implementação não cumpre.

**Fix sugerido**:
```ts
async getHistoryWithToolCalls(
  tableSessionId: string,
  customerId: string | null = null,
) {
  // IDOR guard: se customerId passado, valida que pertence ao caller
  // (mesma validação de sendMessage). Caller só pode ver SEU history,
  // não de outro participante mesmo na mesma mesa.
  let safeCustomerId: string | null = null;
  if (customerId) {
    const participants = await this.tenantConn.query(
      `SELECT 1 FROM session_participants
       WHERE table_session_id = $1 AND customer_id = $2 LIMIT 1`,
      [tableSessionId, customerId],
    );
    if (participants.length === 0) {
      // Não é participante — retorna vazio (sem distinguir "não existe"
      // de "não é seu", padrão B-NEW-17 fix).
      return [];
    }
    safeCustomerId = customerId;
  }
  // ... resto da query usa safeCustomerId
}
```

Ainda assim, `customerId` continua sendo trust-input — pra blindar 100% precisaria controller resolver via cookie (pattern `callerResolver.requireCustomerId(req)`) e ignorar query param.

---

## B-NEW-58 · late-arrival create aceita tableSessionId arbitrário (P2)

**Severidade**: **P2** (impersonation · spam pra mesa alheia).

**Source**:
- `apps/api/src/modules/late-arrival/late-arrival.controller.ts:154-182`.
- `apps/api/src/modules/late-arrival/late-arrival.service.ts:47-91`.

Controller:
```ts
@Post()
@UseGuards(SessionGuard)
async create(
  @Param('slug') slug: string,
  @Body() dto: CreateLateArrivalDto,
  @Session() session: SessionData,
  @Req() req: Request,
) {
  const callerCustomerId = await this.customers.resolveByRecognitionToken(...);
  // ... ownership: customerId derivado do cookie ✓ (round 8 fix B-NEW-27)
  return this.service.create(
    {
      customerId: callerCustomerId.customerId,
      visitId: dto.visitId,
      tableSessionId: dto.tableSessionId ?? session.sessionId,   // ← aceita body
      expectedArrivalAt: dto.expectedArrivalAt,
      message: dto.message,
    },
    slug,
  );
}
```

**Bug**: `dto.tableSessionId ?? session.sessionId` — se cliente passa `tableSessionId` no body, override pro próprio session.sessionId. Customer A em mesa 5 (sessionId=X) faz `POST /late-arrival-requests {tableSessionId: <mesa-7-id-Y>, expectedArrivalAt: '2026-05-09T22:00'}`. Service grava request em mesa 7 atribuído a A:

Service grava `INSERT INTO late_arrival_requests (..., table_session_id, customer_id, ...) VALUES ($2, $3, ...)` com Y, A. Depois:
- `emitLateArrivalCreated(slug, null, {tableSessionId: Y, ...})` (linha 86) → WS event vai pra room `session:<Y>` → host de mesa 7 recebe modal "Alguém vai chegar atrasado em sua mesa" (com nome de A, mensagem livre 500 chars).
- Audit log: "A criou late-arrival pra mesa 7" — A nunca deveria poder fazer isso.
- Spam vetor: A loops UUIDs de tableSessionId conhecidos → cria N requests pra N mesas → fan-out de modais.

**Comparar com round 6 fix B-NEW-12** que cobriu `:id/approve` e `:id/reject` (cookie-derived host check). **`create` (este) ficou sem cross-check com session.sessionId**.

**Mesma família B-NEW-50**: round 10 fixou `table-merge create` (cookie derive `requestingCustomerId`); late-arrival create tem brecha simétrica em `tableSessionId`.

**Repro hipotético**:
1. Customer A em mesa 5. Sabe sessionId de mesa 7 via WS event leak ou guess (sessionId é UUID v4, hard-to-guess SOZINHO, mas combina com B-NEW-44 vector — round 9 mitigou mas customer-side `participantCount` ainda exposto).
2. `POST /:slug/late-arrival-requests {tableSessionId: '<mesa-7-uuid>', expectedArrivalAt: '...'}`.
3. Mesa 7 host vê modal inesperado. Manager investiga, audit log mostra A.

**Fix sugerido**:
```ts
const tableSessionId = dto.tableSessionId ?? session.sessionId;
if (tableSessionId !== session.sessionId) {
  throw new ForbiddenException('Você só pode criar late-arrival pra sua própria sessão.');
}
```

OU simplesmente IGNORAR `dto.tableSessionId` e SEMPRE usar `session.sessionId` (remover field do DTO).

---

## B-NEW-59 · Cobertura de testes apps/api praticamente zero (P3)

**Severidade**: **P3** (qualidade — causa raiz de bugs de concorrência detectados nos rounds 4-9).

**Sources**:
- `apps/api/src/modules/tenant/query-utils.spec.ts` (único arquivo `.spec.ts` em todo `apps/api/src`).
- `services/ai-service/tests/test_*.py` — 8 arquivos.

```bash
$ find apps/api -name "*.spec.ts"
apps/api/src/modules/tenant/query-utils.spec.ts

$ find services/ai-service -name "test_*.py"
test_api_client.py
test_smart_suggestions_and_continuation.py
test_lgpd_messages.py
test_tools_registry.py
test_classify_ack.py
test_classify_call_waiter.py
test_tool_paths.py
test_tool_invocation.py
```

**Bug**: services com lógica não-trivial (concurrency, idempotency, ownership) **sem nenhum teste unitário**:
- `orders.service.ts:75-300` — SETNX poll loop, transaction com RETURNING, multi-step INSERT (orders + order_items + status_history + UPDATE menu_items). Round 10 fix B-NEW-46 (atomic SETNX) — TESTE ZERO de concurrency.
- `payments.service.ts` — TOCTOU dedup (B-NEW-42 deferred).
- `customers.service.ts:53-90` — `welcome` que rotaciona token + dispara cookie + side-effects de UPDATE last_visit_at.
- `table-session.service.ts:200-280` — `addParticipant` com ON CONFLICT DO NOTHING + 23505 catch + COUNT race-prevention.
- `chat-history.service.ts` — Mongo writes + LGPD bulk delete.
- Guards: `SessionGuard`, `StaffOrSessionGuard`, `ManagerOnlyGuard`, `HostOrManagerGuard` — **zero spec**.

Round 9 audit (sumário comparativo) já apontou: "Pattern recorrente: comentários no código afirmam a propriedade (e.g., 'Usa Redis SET NX EX') mas a implementação não cumpre. Sugestão: testes unitários focados em concurrency cobrem essa classe de bugs."

Round 10 fix B-NEW-46 confirmou — comentário pré-fix (linha 81-82) afirmava "Usa Redis SET NX EX" mas implementação era `GET → INSERT → SET` plain. Teste de 2 calls paralelos com mesma key teria pego em CI.

**Casos críticos sem cobertura**:
- B-NEW-51 (feedbacks/complaints sem UNIQUE + dedup) — sem teste race.
- B-NEW-1 (round 3 — complaints CAS race) — sem teste após fix.
- B-NEW-13 (round 4 — claimOrder race) — sem teste após UNIQUE migration.
- B-NEW-14 (round 4 — acknowledgeCall race) — sem teste após CAS.

**Fix sugerido**:
1. CI: rodar `npm test` no `apps/api` e exigir mínimo 1 spec por service crítico.
2. Setup `Jest` + `pg-mem` (in-memory Postgres) ou TestContainers pra testes de integração concurrency.
3. Pra Redis: `ioredis-mock` cobre setNX, get, expire — suficiente pra orders.service test.
4. Cobertura mínima alvo: 60% statement coverage em `services/`. Atual: ~0%.

**Não-bloqueador** mas é a causa raiz de regressões. Custo de cada bug encontrado em produção (Round 4-10 ≈ 55 achados) >> custo de escrever specs.

---

## Outras observações (não-achados)

### Round 10 PR cobriu 7 dos 10 achados do round 9

Confirmado:
- ✓ B-NEW-46 (orders idempotency atomic SETNX) — `orders.service.ts:78-138` reescrito.
- ✓ B-NEW-47 (order-ratings ownership via JOIN) — `order-ratings.service.ts` ganhou método com filtro.
- ✓ B-NEW-48 (markVip ManagerOnlyGuard) — `customers.controller.ts:224-235` com `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)`.
- ✓ B-NEW-49 (parcial — 5 controllers): staff-table-merge, complaints, staff-messages, zone-pause, vip. **Host DTOs deferred** (B-NEW-56 cobre).
- ✓ B-NEW-50 (table-merge create cookie ownership) — `table-merge.controller.ts:77-99`.
- ✓ B-NEW-43 (docker-compose ports → expose) — `docker-compose.yml:1-56`. POSTGRES_PASSWORD agora env override.
- ✓ B-NEW-54 (WS gateway CORS env-driven) — `events.gateway.ts:66-78`.

Deferred pra round 11+:
- ✗ B-NEW-41 (DB pool size + query logging dev/staging). `database.config.ts:1-9` ainda sem `extra.max`, `logging: process.env.NODE_ENV !== 'production'`.
- ✗ B-NEW-42 (payments idempotency). `payments.service.ts:99-117` ainda SELECT-then-INSERT.
- ✗ B-NEW-51 (feedbacks/complaints UNIQUE + idempotency). `feedbacks.service.ts:19-30` ainda TOCTOU; `complaints.service.ts:22-79` sem dedup; migrations 013/026 sem UNIQUE em `visit_id`.
- ✗ B-NEW-52 (menu/search rate limit). `menu.controller.ts:33-41` aceita string ilimitada.
- ✗ B-NEW-53 (JSON.parse defense). 4 sites confirmados sem try/catch:
  - `session.guard.ts:39`
  - `staff-or-session.guard.ts:76`
  - `events.gateway.ts:140` (handleConnection branch session)
  - `table-session.service.ts:173` (`getSessionFromToken`)
  
  Round 9 fix em `events.gateway.ts:238-249` (handleJoinSession staff branch) JÁ tem try/catch — não estendeu pros outros sites.
- ✗ B-NEW-55 (WS handshake rate limit).

**3 deferreds tornaram-se 6** (round 9 → round 10 fixou só 1 dos 3 deferreds históricos: 43). Backlog de P2/P3 cresceu porque round 10 priorizou P1.

### Cookie consistency — limpa

Re-grep `res.cookie` em `apps/api/src/`:
- `session_token` (table-session.controller.ts:38-44): `httpOnly, secure: prod, sameSite: lax, maxAge: 4h`. ✓
- `recognition_token` (3 sites em customers.controller.ts:131, 291, 337): mesmo flags pós-round-9. ✓

Apenas 2 cookies emitidos. Sem outros cookies (theme/locale/etc) que pudessem carregar PII. Item 9 do prompt — clean.

### Logs PII — clean

Re-grep `Logger.warn/error/log` em apps/api/src/modules/{customers, lgpd, chat-history, staff}:
- `customers.service.ts:74-82`: `cpf_hash` mascarado (`cleanCpf.slice(0,3) + '***' + cleanCpf.slice(-2)`); `customer_id` é UUID (não-PII); `recognition_token` plain NÃO logado. ✓
- `chat-history.service.ts:78, 139, 239`: só `customerId` UUID + erro generic. ✓
- `lgpd.service.ts`: nenhum logger com payload sensível. ✓
- `staff.service.ts`: throttle logs sem PIN ou pin_hash. ✓

DB logging (B-NEW-41) é o vetor real — `logging: NODE_ENV !== 'production'` em dev/staging registra TODAS queries SQL, incluindo INSERT customers com CPF plain. Mas isso é orquestração TypeORM, não Logger.warn — coberto por B-NEW-41 deferred.

### chat-history.listMessages — risco residual baixo

`chat-history.service.ts:167-183` é método **público** na class mas só é chamado por `listMessagesForCustomer` (com ownership check). Atualmente safe; future authors podem usar direto. Sugestão round 9 manté: prefixar `_unsafeListMessages` ou tornar private. Não-achado novo.

### Mongo write patterns — clean

`chat-history.service.ts:65-143` (`appendTurn`): `customerId` vem de `assistant.service.ts` (do `safeCustomerId` validado pra session_participants). Sem path direto que aceite `threadId` arbitrário do cliente.

### Migrations 040+ — não há

Sequência atual (035-039): host module, table_merge dual-consent, table_merge cooldown directional, order_deliveries unique, drop session_token. Sem 040+ no repo. Round 10 não adicionou migration nova (apenas mudanças de código).

### TypeORM raw query — schemaName interpolado seguro

3 sites de `SET search_path = '${schemaName}'` raw template:
- `tenant-connection.provider.ts:42, 66`
- `ttl-tick.service.ts:86`
- `rating-push.service.ts:82`

`tenant.middleware.ts:49-57` valida `schemaName` por regex `[a-z_][a-z0-9_]{0,62}` ANTES de stamp em request. Cron jobs (ttl-tick, rating-push) re-validam o regex localmente antes de interpolar. Defense in depth ✓. Item 12 — clean.

### Session/init não tem rate limit — risco baixo

`POST /:slug/session/init` (table-session.controller.ts:25-51) é anônimo (sem guard) mas exige HMAC signature válida. Replay window é a janela do timestamp HMAC (não auditei o tempo exato). Sem rate-limit IP, mas:
- Cada attempt faz 1 query DB (`SELECT id, code, label, qr_hmac_secret FROM tables WHERE code = $1`) — barato.
- HMAC inválida = 401 instant, sem INSERT.
- Reuso de session via `WHERE table_id = $1 AND status = 'active' AND created_at > NOW() - INTERVAL '4 hours'` — bem arquitetado pra evitar DoS de table_sessions.

Não-achado material. Item 4 — risk low.

### Token revoke / logout — não existe

Nenhum endpoint pra invalidar `session_token`, `recognition_token`, ou staff PIN. Customer fired/comprometido continua com cookie válido até TTL (4h sessão, 1y recognition). Staff fired tem `is_active=false` (verifyPin rejeita), MAS `x-staff-key` continua o secret SHARED — todos staff têm mesmo. Não é P0/P1 mas é gap operacional.

Round 11+ candidate: `DELETE /:slug/customer/me` (revoga recognition_token + clears cookie) e `POST /staff/:id/revoke-sessions` (invalida tokens cached em Redis pra aquele staff). Não bloqueia release.

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| **10** | **0** | **2** | **1** | **1** | **4** |

Densidade caiu drasticamente: 14 (round 5) → 13 (round 7) → 10 (round 9) → **4 (round 10)**. P0 = 0 pelo segundo round consecutivo. Trend confirmado: **convergência detectável**.

**Categorização dos 4 achados**:
- **Famílias incompletas pós-fix** (B-NEW-56, 58): round 10 cobriu 5/8 controllers do staffId sweep e 1/2 endpoints do tableSessionId/customerId-from-body sweep — restante são gaps simétricos.
- **IDOR não-detectado em audits anteriores** (B-NEW-57): assistant.history nunca foi explicitamente auditado em rounds 3-9; B-NEW-16 fixou a versão Mongo; Postgres-based assistant_messages ficou sem o check.
- **Quality gap** (B-NEW-59): cobertura de testes apps/api ≈ 0. Causa raiz de regressões.

Backlog acumulado (deferreds históricos):
- **B-NEW-41** (DB pool + logging) — ainda aberto.
- **B-NEW-42** (payments idempotency) — ainda aberto, payment é P1 quando ganhar tráfego real.
- **B-NEW-51** (feedbacks/complaints UNIQUE + dedup) — ainda aberto.
- **B-NEW-52** (menu/search rate limit) — ainda aberto.
- **B-NEW-53** (JSON.parse try/catch 4 sites) — 1 fixado, 3 ainda abertos.
- **B-NEW-55** (WS handshake throttle) — ainda aberto.

---

## Recomendação de priorização

**P1 antes do release** (2):
1. **B-NEW-56** · staffId sweep restante: host DTOs (5 sites em host.service) + cross-check DB no `requireStaffId`. Custo: ~4h.
2. **B-NEW-57** · assistant.getHistoryWithToolCalls participant ownership check (replicar pattern de sendMessage). Custo: ~30min.

**P2 backlog** (1):
3. **B-NEW-58** · late-arrival.create rejeitar `dto.tableSessionId` divergente de session.sessionId. Custo: ~15min.

**P3 nice-to-have** (1):
4. **B-NEW-59** · setup Jest + pelo menos 5 spec files cobrindo orders/payments/customers/table-session/chat-history. Custo: ~2 dias (não-bloqueador).

**Backlog deferido pra Round 11**: B-NEW-41, B-NEW-42, B-NEW-51, B-NEW-52, B-NEW-53 (3 sites restantes), B-NEW-55. Total: 6 P2 + 1 P3 (B-NEW-59 acima). Nenhum P0/P1 nos deferreds.

---

## Convergência detectada — recomendação de loop

Trend visualizada:

```
Round  P0  P1  P2  P3  Total
  3     0   1   4   2    7
  4     3   2   3   1   11
  5     6   4   3   1   14
  7     3   4   5   1   13
  9     0   5   3   2   10
 10     0   2   1   1    4   ← marca de convergência
```

**Observações**:
1. **P0 = 0 por 2 rounds consecutivos** (9 e 10). Sweep cumulativo fechou role-bypass / IDOR direto.
2. **P1 caiu 60% round-over-round** (5 → 2). Achados restantes são família-irmã + 1 IDOR não-detectado anteriormente.
3. **Total caiu 60%** (10 → 4). Curva achatou claramente.
4. **Achados deste round**: 2 são "fix incompleto do round 10" (família imediata), 1 é "fix incompleto de round 5" (assistant.getHistory simétrico de chat-history.listMessages), 1 é gap de teste (não-funcional).

**Critério do prompt**: "Loop encerra quando bug-hunt retornar 0 P0/P1 OU só achados triviais P3". Round 10 ainda tem 2 P1 (B-NEW-56, B-NEW-57) — **não trivial**. Mas:
- B-NEW-56 já está auto-deferida pelo round 10 commit ("host DTOs deferred").
- B-NEW-57 é descoberta nova (não estava em backlog).
- B-NEW-58 / B-NEW-59 são P2/P3 baixos.

**Estimativa de Round 11**:
- Round 11 cobre B-NEW-56 + B-NEW-57 + os deferreds históricos (41, 42, 51, 52, 53, 55). Round 11 audit terá ainda menos achados — provavelmente **0-2 P1 + 1-2 P2/P3**.
- **Round 12 audit** com alta probabilidade retorna **0 P0/P1**, fechando o loop.

**Recomendação**: continuar pro round 11 pra cobrir os 6 deferreds + B-NEW-56/57/58. Após o PR round 11, fazer round 11 audit. Se retornar 0 P0/P1 → encerrar loop.

Alternativa: aceitar B-NEW-56/57/58 como deferred + reportar B-NEW-41/42/51/52/53/55 como aceitos backlog → encerrar loop AGORA (assumindo gestão de risco aceita 6 P2/P3 + 2 P1 não-bloqueadores).

**Posição da Frente B**: **loop pode encerrar após backlog deferido + Round 11 cobrir B-NEW-56/57** (P1 limpos). Round 12 audit é confirmação final.
