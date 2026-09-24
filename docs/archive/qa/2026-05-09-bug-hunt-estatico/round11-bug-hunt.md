# Round 11 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes do PR Round 11 (B-NEW-56 host DTOs + B-NEW-57 assistant history + B-NEW-58 late-arrival tableSessionId + B-NEW-42 payments SETNX).
> Target: descobrir bugs NOVOS pós PR round 11. Foco em famílias-irmãs incompletas
> e regressions dos fixes recentes. Sem rodar — só audit estático.

## TL;DR

**4 achados novos · 3 P1 · 1 P2 · 0 P3.** Trend de convergência **interrompida**: round 10 trouxe 4 achados (2 P1+1 P2+1 P3), round 11 traz 4 (3 P1+1 P2+0 P3) — densidade similar mas P1 SUBIU. Causa: round 11 deixou `requireActiveStaffId` definido mas NÃO wired em nenhum controller, deixando vulnerabilidade B-NEW-56b (audit-log spoof via header) intacta.

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| 10 | 0 | 2 | 1 | 1 | 4 |
| **11** | **0** | **3** | **1** | **0** | **4** |

- **B-NEW-60 (P1)**: `CallerResolverService.requireActiveStaffId` foi DEFINIDO no round 11 (caller-resolver.service.ts:118) mas **nunca chamado**. Os controllers que motivaram o fix (B-NEW-56b do round 10) ainda usam o `requireStaffId` shape-only: `complaints.controller.ts:178` (`resolve` com apenas StaffOnlyGuard) e TODOS os endpoints de `staff-messages.controller.ts` (60-102 — controller-level StaffOnlyGuard sem ManagerOnlyGuard). Atacante com `x-staff-key` válido + `x-staff-id: <UUID-arbitrário>` (válido em shape, mas inexistente no DB OU com is_active=false) passa, e o service grava `resolved_by_staff_id`/`sender_staff_id`/`read_by_staff_id` com o UUID falso. Audit log corrompido — manager investigando vê staff fired ou inexistente como autor da ação.

- **B-NEW-61 (P1)**: `POST /:slug/table-merge-requests` (table-merge.controller.ts:84-97) ainda aceita `sourceTableSessionId` E `targetTableSessionId` arbitrários do body sem cross-check com `session.sessionId`. Round 10 fixou `requestingCustomerId` (cookie-derived) mas as duas UUIDs de sessão ficaram. Customer A em mesa 5 faz `POST {sourceTableSessionId: <mesa-7>, targetTableSessionId: <mesa-9>, requestingCustomerId: <cookie>}` → service insere row com source/target alheios. WS event `table_merge.created` é emit pra `customer:targetCustomerId`, `session:targetSessionId` (linha 561-582 events.gateway.ts). Vítima recebe modal "alguém quer juntar mesa 7→9" sem ter pedido. Cooldown subsequente (rejeição) bloqueia merge legítimo entre o par alheio. **Mesma família B-NEW-58 (late-arrival tableSessionId) que round 11 fixou — table-merge ficou esquecido**.

- **B-NEW-62 (P1)**: `POST /:slug/table/participants/decide` (table.controller.ts:45-57) aceita `hostCustomerId` arbitrário do body. Service `decideJoinRequest` (table-session.service.ts:321-362) compara `host_customer_id === requesterCustomerId` mas usa `dto.hostCustomerId` (body) como `requesterCustomerId`. Customer A em mesa shared (mesmo session_token cookie do host real H, mas `recognition_token` diferente) faz `POST {hostCustomerId: <H-uuid>, targetCustomerId: <random-pending>, decision: 'approve'}` → check passa (H realmente é host), participant aprovado em nome de H. Audit log: H aprovou. Vetor real: cliente impostor entra na mesa, A aprova-o como host (sem H autorizar). **Mesma família B-NEW-50 (table-merge `requestingCustomerId` from body) — pattern simétrico não replicado. Round 10 cobriu table-merge create + approve/reject; participants/decide ficou.**

- **B-NEW-63 (P1)**: `GET /:slug/home?customerId=<UUID>` (home.controller.ts:11-23 + home.service.ts:48-191) sem ownership check. Service lê `name` + `customer_consumption_summary.{last_items, favorite_items, total_spent_cents}` filtrado SOMENTE por `customer_id = $1` — sem JOIN com `session_participants` pra validar que o customerId é participante da sessão. Customer A em mesa 5 passa `?customerId=<B-uuid>` (vazado via `/table/participants` ou `/customer/recognize`) e o response inclui:
  - Nome de B (`nome`).
  - Histórico de consumo: `last_items` (lista de pratos com nome+categoria), `favorite_items`, `total_spent_cents`.
  - `heroMessage` renderizado COM o nome de B + último prato/bebida/sobremesa de B.
  
  PII LGPD-relevant (preferência alimentar, histórico de gasto, identidade). **Mesma família B-NEW-57 (assistant history) que round 11 fixou — home não foi auditado em rounds anteriores e ficou aberto desde sempre**.

Detalhes abaixo. Outras observações (não-achados) na seção final.

---

## B-NEW-60 · requireActiveStaffId definido mas não-wired (P1)

**Severidade**: **P1** (audit log spoof — bug B-NEW-56b do round 10 NÃO fechado apesar do commit message do round 11 alegar "round 11 cobriu B-NEW-56b").

**Evidência objetiva**:

```bash
$ grep -rn "requireActiveStaffId" apps/api/src/
apps/api/src/common/services/caller-resolver.service.ts:118: async requireActiveStaffId(req: Request): Promise<string> {
apps/api/src/common/services/caller-resolver.module.ts:15:   * TenantConnectionProvider em `requireActiveStaffId`.
```

A função existe (linha 118-131) com lookup DB correto:
```ts
async requireActiveStaffId(req: Request): Promise<string> {
  const staffId = this.requireStaffId(req);
  const rows = await this.tenantConn.query(
    `SELECT 1 FROM staff WHERE id = $1 AND is_active = true`,
    [staffId],
  );
  if (!rows.length) throw 401;
  return staffId;
}
```

Mas **NENHUM controller a invoca**. Os endpoints alvo do round 10 audit (B-NEW-56b) continuam usando `requireStaffId` (shape-only):

1. **`complaints.controller.ts:178`** (`@Post(':id/resolve') @UseGuards(StaffOnlyGuard)` — sem ManagerOnlyGuard, sem HostOrManagerGuard):
   ```ts
   const staffId = this.callerResolver.requireStaffId(req);  // ← shape-only
   return this.service.resolve(id, { staffId }, slug);
   ```

2. **`staff-messages.controller.ts:78, 84, 100`** (todos endpoints — controller tem `@UseGuards(StaffOnlyGuard)` no nível class, sem ManagerOnlyGuard):
   - `send` (linha 78): `senderStaffId = this.callerResolver.requireStaffId(req)`
   - `listThreads` (linha 84): `staffId = this.callerResolver.requireStaffId(req)`
   - `markRead` (linha 100): `staffId = this.callerResolver.requireStaffId(req)`

**Repro**:
1. Atacante é waiter com `x-staff-key` válido (shared secret) e `x-staff-id: <waiter-W-uuid>` válido no DB.
2. Curl: `POST /:slug/complaints/<id>/resolve -H 'x-staff-key: ...' -H 'x-staff-id: 00000000-0000-0000-0000-000000000000'`.
3. `StaffOnlyGuard` valida `x-staff-key` ✓. `requireStaffId` valida shape UUID ✓ (sem lookup DB). Service grava `resolved_by_staff_id = 00000000-...`.
4. Audit log mostra "complaint resolvida por staff `00000000-...`" — UUID inexistente. Manager investigando vê orphan reference.
5. Variação spoof: atacante passa UUID de manager M-uuid (real, mas fora de turno). Audit log mostra "M resolveu complaint X às 03h" — spoof do colega.

**Mesmo vetor em `staff-messages.send`**: atacante passa UUID de outro staff e mensagem é enviada como sender = colega (impersonation real, recipient vê DM falsa de outro funcionário).

**Comparar com fix correto em outros controllers**:
- `complaints.respond` (linha 158-168) usa `ManagerOnlyGuard` que faz DB lookup do role — defesa em depth. `resolve` ficou só com StaffOnlyGuard.
- `host.controller`, `vip.controller`, `staff-table-merge.controller`, `zone-pause.controller` todos compõem com `HostOrManagerGuard` ou `ManagerOnlyGuard` que também fazem DB lookup. Apenas `complaints.resolve` e `staff-messages.*` são staff-only sem segunda layer.

**Fix sugerido** (baixo custo — 4 linhas trocadas):
```ts
// complaints.controller.ts:178
- const staffId = this.callerResolver.requireStaffId(req);
+ const staffId = await this.callerResolver.requireActiveStaffId(req);

// staff-messages.controller.ts:78, 84, 100
- const staffId = this.callerResolver.requireStaffId(req);
+ const staffId = await this.callerResolver.requireActiveStaffId(req);
```

Round 11 já adicionou DI `TenantConnectionProvider` no `CallerResolverModule` — só falta usar o método.

---

## B-NEW-61 · table-merge create aceita source/target arbitrário (P1)

**Severidade**: **P1** (impersonation · spam pra mesa alheia · cooldown grief).

**Source**:
- `apps/api/src/modules/table-merge/table-merge.controller.ts:84-97`.
- `apps/api/src/modules/table-merge/table-merge.service.ts:51-152`.

```ts
@Post()
@UseGuards(SessionGuard)
async create(
  @Param('slug') slug: string,
  @Body() dto: CreateMergeDto,
  @Session() _s: SessionData,    // ← session ignorada (sem cross-check)
  @Req() req: Request,
) {
  const callerCustomerId = await this.callerResolver.requireCustomerId(req);
  return this.service.createRequest(
    { ...dto, requestingCustomerId: callerCustomerId },  // ← source/target do body intactos
    slug,
  );
}
```

DTO (linha 25-43):
```ts
class CreateMergeDto {
  @IsUUID() sourceTableSessionId!: string;       // ← arbitrário do body
  @IsUUID() targetTableSessionId!: string;       // ← arbitrário do body
  @IsUUID() requestingCustomerId!: string;       // (ignorado — cookie override)
  @IsOptional() @IsUUID() targetCustomerId?: string;  // ← arbitrário do body
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
```

Service `createRequest` (linha 51-152) NÃO valida que `sourceTableSessionId === session.sessionId`. INSERT direto:
```sql
INSERT INTO table_merge_requests
  (source_table_session_id, target_table_session_id, requesting_customer_id, ...)
VALUES ($1, $2, $3, ...)
```

E o WS broadcast em `events.gateway.ts:561-582`:
```ts
emitTableMergeCreated(slug, originCustomerId, targetCustomerId, payload) {
  this.server.to(`tenant:${slug}`).emit('table_merge.created', payload);
  this.server.to(`customer:${originCustomerId}`).emit(...);
  if (targetCustomerId) this.server.to(`customer:${targetCustomerId}`).emit(...);
  this.server.to(`session:${payload.originSessionId}`).emit(...);
  this.server.to(`session:${payload.targetSessionId}`).emit(...);
}
```

→ atacante controla `targetCustomerId` E `targetSessionId` no payload do WS — pode spam vítima em qualquer mesa do tenant.

**Repro**:
1. Customer A em mesa 5 (sessionId-A, recognition_token cookie). Sabe sessionId de mesa 7 (vaza via WS event leak ou guess) E customerId de host de mesa 7 (vaza via `/table/participants` da mesa 5 + history).
2. Curl: `POST /:slug/table-merge-requests -H 'Cookie: session_token=<sessionId-A>; recognition_token=<A-token>' -d '{"sourceTableSessionId": "<mesa-7-uuid>", "targetTableSessionId": "<mesa-9-uuid>", "requestingCustomerId": "<A>", "targetCustomerId": "<host-mesa-9>", "message": "Aceita?"}'`.
3. Service insere row com source=7, target=9, requestingCustomerId=A.
4. WS emit pra `customer:<host-mesa-9>` + `session:<mesa-9>` → host mesa 9 vê modal "Mesa 7 quer juntar com você" sem ter sido pedido por NINGUÉM da mesa 7.
5. Audit log: A criou request entre mesas 7 e 9 — A nem está em nenhuma das duas.
6. Cooldown: se host rejeita, `table_merge_cooldowns` salva pair (7, 9) com 10min de bloqueio. Mesa 7 LEGÍTIMA não consegue mergear com mesa 9 por 10min.

**Comparar com round 11 fix B-NEW-58** (late-arrival.create line 180):
```ts
tableSessionId: session.sessionId,    // ← SEMPRE da session, ignora dto
```

Mesma fix pattern aplicável aqui — adicionar guard:
```ts
if (dto.sourceTableSessionId !== _s.sessionId) {
  throw new ForbiddenException('source deve ser sua mesa.');
}
```

OU forçar `sourceTableSessionId: _s.sessionId` ignorando o body.

---

## B-NEW-62 · table.participants/decide aceita hostCustomerId arbitrário (P1)

**Severidade**: **P1** (impersonation · waiter rogue/customer impostor aprovado em nome de host).

**Source**:
- `apps/api/src/modules/table-session/table.controller.ts:45-57`.
- `apps/api/src/modules/table-session/table-session.service.ts:321-362`.

Controller:
```ts
@Post('participants/decide')
@UseGuards(SessionGuard)   // ← só valida session existe
async decideJoinRequest(
  @Session() session: SessionData,
  @Body() dto: JoinDecisionDto,    // ← contém hostCustomerId arbitrário
) {
  return this.tableSessionService.decideJoinRequest(
    session.sessionId,
    dto.hostCustomerId,    // ← passado como "requesterCustomerId"
    dto.targetCustomerId,
    dto.decision,
  );
}
```

DTO (linha 7-19):
```ts
class JoinDecisionDto {
  @IsUUID() hostCustomerId!: string;     // ← qualquer UUID
  @IsUUID() targetCustomerId!: string;
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
}
```

Service (linha 321-362):
```ts
async decideJoinRequest(
  tableSessionId: string,
  requesterCustomerId: string,    // ← vem de dto.hostCustomerId
  targetCustomerId: string,
  decision: 'approve' | 'reject',
) {
  const sessionRows = await query(`SELECT host_customer_id FROM table_sessions WHERE id = $1`, [tableSessionId]);
  if (sessionRows[0].host_customer_id !== requesterCustomerId) {
    throw 'Apenas o host da mesa pode aprovar...';
  }
  // ... UPDATE session_participants SET status = ..., approved_by = requesterCustomerId
}
```

**Bug**: O check `host_customer_id !== requesterCustomerId` valida que o UUID É o do host. Mas `requesterCustomerId` vem do **body**, não do **cookie do caller**. Customer A na mesma session que o host H pode passar `hostCustomerId: <H-uuid>` (UUID real do host, vazado via `/table/participants`) e o check passa.

**Vetor**: Customer A em mesa shared (mesma sessionId que host H, scan QR criou session, A entrou depois pendente, H aprovou A). Agora:
- Outro customer X (impostor, ou amigo do A externo ao restaurante) escaneia QR da mesa, entra como pending.
- H NÃO está atento. A faz `POST /:slug/table/participants/decide` com `{hostCustomerId: <H-uuid>, targetCustomerId: <X-uuid>, decision: 'approve'}`.
- Service vê: session_token cookie de A é válido (ele já está na mesa), `host_customer_id === H-uuid` (H é host real). Check passa.
- X aprovado. `approved_by = H-uuid` no audit log. H nunca aprovou X.

**Consequências operacionais**:
- X agora é approved participant da mesa, pode ver `/table/participants` (lista todos), abrir orders, ver history (ainda que IDOR seja blocked em outras superfícies, X compartilha bill).
- Audit: H acusado de aprovar X — em disputa real, dispute resolution mostra H como decisor.
- Variação rejection: A faz `decision: 'reject'` em participant pending legítimo (amigo do H que H quis aprovar) — sabotage social.

**Comparar com fixes anteriores da família**:
- `table-merge.approve/reject` (round 8/9): `decidedByCustomerId` derivado do cookie via `callerResolver.requireCustomerId(req)`.
- `late-arrival.approve/reject` (round 6 B-NEW-12): `assertHostOrThrow(req, id)` que deriva customerId do cookie e cross-checka host.
- `table-merge.create` (round 10 B-NEW-50): `requestingCustomerId` derivado do cookie.
- **`table.participants/decide` (round 8+) ficou sem o pattern.**

**Fix sugerido**:
```ts
@Post('participants/decide')
@UseGuards(SessionGuard)
async decideJoinRequest(
  @Session() session: SessionData,
  @Body() dto: JoinDecisionDto,
  @Req() req: Request,
) {
  const callerCustomerId = await this.callerResolver.requireCustomerId(req);
  return this.tableSessionService.decideJoinRequest(
    session.sessionId,
    callerCustomerId,    // ← do cookie, ignora dto.hostCustomerId
    dto.targetCustomerId,
    dto.decision,
  );
}
```

`hostCustomerId` no DTO pode ser removido (ou mantido como deprecated — service ignora).

---

## B-NEW-63 · GET /home expõe perfil de outro customer (P1)

**Severidade**: **P1** (IDOR · vaza histórico de consumo / nome / preferências PII LGPD).

**Source**:
- `apps/api/src/modules/home/home.controller.ts:11-23`.
- `apps/api/src/modules/home/home.service.ts:48-191`.

Controller:
```ts
@Get()
@UseGuards(SessionGuard)
async getHome(
  @Session() session: SessionData,
  @Query('customerId') customerId?: string,    // ← arbitrário do query
) {
  return this.homeService.getHome(session.sessionId, customerId, session.tableLabel);
}
```

Service (linha 84-106):
```ts
if (customerId) {
  const customers = await this.tenantConn.query(
    'SELECT name FROM customers WHERE id = $1',
    [customerId],     // ← sem JOIN com session_participants
  );
  if (customers.length > 0) nome = customers[0].name;

  const summary = await this.tenantConn.query(
    'SELECT last_items, favorite_items, total_spent_cents FROM customer_consumption_summary WHERE customer_id = $1',
    [customerId],     // ← sem ownership check
  );
  // ...
  lastVisitSummary = summary[0];
  ultimoPrato = lastItems[0]?.name;
  ultimaBebida = lastItems.find(i => i.category === 'Bebidas')?.name;
  ultimaSobremesa = lastItems.find(i => i.category === 'Sobremesas')?.name;
}

const heroMessage = renderTemplate(idx, {
  nome,
  ultimo_prato: ultimoPrato,
  ultima_bebida: ultimaBebida,
  ultima_sobremesa: ultimaSobremesa,
});

return { heroMessage, ..., isReturning, lastVisitSummary, ... };
```

**Bug**: `customerId` from query NÃO é validado contra session participants nem contra cookie-derived caller. Response expõe:
- `nome` (nome do customer arbitrário).
- `lastVisitSummary` = `{last_items, favorite_items, total_spent_cents}` — JSONB com lista de pratos consumidos, lista de favoritos, spend total. **Histórico de consumo é LGPD-relevant** (revela hábitos, frequência, preferências dietéticas).
- `heroMessage` rendered: "Olá Maria, seu último Hambúrguer ficou ótimo, recomendo a sobremesa Pudim..." — vaza nome + último prato + última sobremesa.

**Vetor de leak do customerId**: 
- `GET /:slug/table/participants` (table.controller.ts:30-37) retorna ARRAY de `{customerId, name, color, status, isHost}` de todos os participantes da sessão.
- `GET /:slug/customer/recognize` retorna customerId no body em path de re-identificação.
- WS events `complaint.received` / `late_arrival.created` / `table_merge.created` carregam `customerId` em payloads.

**Repro**:
1. Customer A em mesa 5 com session válida + recognition_token. Lê `GET /:slug/table/participants` → vê customerId de B (na mesma mesa).
2. `GET /:slug/home?customerId=<B-uuid>` → response inclui heroMessage com NOME DE B + último consumo de B + total_spent_cents histórico.
3. Variação cross-mesa: A obtém customerId de cliente em outra mesa via algum vector (B-NEW-44 já mitigado, mas residual via WS broadcasts) e lê home alheio.
4. PII: B é cliente VIP frequente (`total_spent_cents` alto), A descobre habits via `last_items` e `favorite_items` — info útil pra phishing/SE.

**Comparar com B-NEW-57** (round 11 fix em assistant.history): mesma estrutura — query param customerId sem ownership. Round 11 trocou pra `callerResolver.tryGetCustomerId(req)` (cookie-derived). Home não foi auditado em rounds anteriores.

**Severidade P1 mesmo vetor sendo "intra-mesa"** porque:
- Histórico de consumo + spend total é PII LGPD-sensitive (mais que chat history em alguns aspectos).
- UI do home faz uso autônomo (renderiza heroMessage) — atacante não precisa social engineer pra ler.
- Comentário do home.service NÃO documenta intent de IDOR check (diferente de assistant.service que tinha o intent comentado).

**Fix sugerido**:
```ts
// home.controller.ts
@Get()
@UseGuards(SessionGuard)
async getHome(
  @Session() session: SessionData,
  @Req() req: Request,
) {
  const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
  return this.homeService.getHome(session.sessionId, callerCustomerId, session.tableLabel);
}
```

Module update: importar `CallerResolverModule` em `HomeModule` (igual round 11 fez pra `AssistantModule`).

Custo: ~30 min. Mesmo pattern já implementado 4x nos rounds 8-11.

---

## Outras observações (não-achados)

### B-NEW-58 (late-arrival tableSessionId) FECHADO ✓

`late-arrival.controller.ts:180` agora força `tableSessionId: session.sessionId` ignorando dto. Confirmado fix funcional.

### B-NEW-57 (assistant.history customerId) FECHADO ✓

`assistant.controller.ts:75` usa `callerResolver.tryGetCustomerId(req)`. Confirmado. Risco residual: FE legítimo passava `customerId` via query — verificado que NENHUM cliente FE atual chama `/assistant/history` (grep em apps/web-customer/src vazio). Round 11 fix sem regressão.

### B-NEW-42 (payments SETNX) FECHADO ✓ — finally release garantido

`payments.service.ts:103-157` envolve dedup + INSERT em try/finally que sempre faz `redis.del(lockKey)`. Throw em qualquer ponto intermediário (BadRequestException de duplicate pending) libera o lock — confirmado. Linha 137-139:
```ts
} else {
  throw new BadRequestException('Ja existe um pagamento pendente.');  // ← throw em try
}
// finally bloco SEMPRE roda → redis.del(lockKey)
```

**TTL fallback**: lock tem TTL=30s, então mesmo se um throw ainda mais raro escapasse o try/finally (impossível em código async/await JS), Redis auto-expira. Defense in depth. ✓

### B-NEW-56 (host DTOs staffId sweep) FECHADO ✓ — defensive spread

`host.controller.ts:79-184` faz `{ ...body, staffId }` AFTER body spread em 6 sites (liberate, vip, createSwap, updateSwap, legacySwap, createReservation). Spread pattern garante que `staffId` derivado do header SOBRESCREVE qualquer `body.staffId` arbitrário do cliente — DTO field é dead.

**Note**: DTOs ainda têm `staffId?: @IsUUID()` opcional pra back-compat. Isso é code-smell (atacante consegue enviar mas será ignorado), não vulnerabilidade. Sugestão: adicionar `@Transform(() => undefined)` pra strip server-side, mas não é P0.

### B-NEW-56b (requireActiveStaffId) NÃO FECHADO — vide B-NEW-60 acima

Função criada mas não-wired. Detalhado em B-NEW-60.

### Cookie consistency — limpa

Re-grep `res.cookie` em apps/api/src:
- `session_token` (table-session.controller.ts:38-44): httpOnly ✓, secure: prod ✓, sameSite: lax ✓, maxAge: 4h ✓.
- `recognition_token` (3 sites em customers.controller.ts:132, 291, 337): httpOnly ✓, secure: prod ✓, sameSite: lax ✓, maxAge: 1y ✓.

Apenas 2 cookies emitidos. Sem outros cookies que carreguem PII. ✓

### WS auth handshake — limpa

`events.gateway.ts:87-156` (handleConnection):
- Staff path: exige `x-staff-key` (timing-safe compare) + `x-staff-id` (rejeita se ausente — round 9 B-NEW-36).
- Session path: lê `session_token`, validate via Redis lookup.
- Sem nenhuma das duas → disconnect.

`x-staff-role` é stamped em `client.data.staffRole` mas **NUNCA consumido** em decisão de autorização (linha 130 só armazena, nenhum subscribe lê). Dead code, não vulnerabilidade. Pode ser removido em refactor futuro.

`@SubscribeMessage('join:tenant')`, `join:session`, `join:staff`, `join:manager`, `join:customer` todos validados pós-round-9. Não auditei novas subscribe-messages — confirmado que apenas essas 5 existem (grep).

### Idempotency cobrança em POST endpoints

Implementado:
- `orders.create` — Redis SETNX atomic (round 10 B-NEW-46) ✓.
- `payments.requestPayment` — Redis SETNX lock (round 11 B-NEW-42) ✓.

Aberto (P2 backlog B-NEW-51):
- `complaints.create` — sem dedup (manager spam em double-tap).
- `feedbacks.submit` — SELECT-then-INSERT TOCTOU + sem UNIQUE em visit_id.
- `waiter-calls.create` — sem dedup mas MIGRATION 014 tem UNIQUE em (table_session_id, status='pending').

Outras POST com side-effects sem idempotency:
- `late-arrival.create` — broadcasts WS, sem dedup. Customer double-tap = 2 modais pro host. Spam controlable mas operacionalmente irritante. **P3 — não-bloqueador**.
- `lgpd.create` — síncrono erasure no Mongo. Idempotente por natureza (segundo erasure não-op). Safe. ✓
- `staff-messages.send` — broadcasts WS, sem dedup. Manager double-tap = 2 mensagens em thread. **P3**.
- `vip.toggle` — flag toggle, idempotent por natureza (set add/remove twice = same result). ✓

P2/P3 deferred — não bloqueador.

### B-NEW-41 (DB pool + logging) AINDA ABERTO

`apps/api/src/config/database.config.ts:1-9`:
```ts
export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL || '...',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',  // ← dev/staging registra TODAS queries
};
```

Sem `extra: { max: N }` (pool size default = 10). Sem `extra: { idleTimeoutMillis: ... }`. Em prod com tráfego real (>10 concurrent requests) saturaria. **P2 não-bloqueador** — deploy em homol vai refletir.

`logging: true` em dev/staging registra **TODAS** queries SQL — incluindo `INSERT INTO customers (cpf_hash, ...)` e `INSERT INTO assistant_messages (user_message, ...)`. Logs em dev podem incluir CPFs hash e mensagens livres do cliente. LGPD-relevant em ambiente de staging com data real. **P2** — sugestão: trocar pra `logging: ['error', 'warn']` em todos os ambientes.

### B-NEW-51 (feedbacks/complaints UNIQUE + dedup) AINDA ABERTO

Confirmado:
- `feedbacks.service.ts:19-30` ainda SELECT-then-INSERT TOCTOU.
- `complaints.service.ts:22-79` sem dedup.
- Migration 013 (`feedbacks`): só `idx_feedbacks_visit_id` non-unique.
- Migration 026 (`complaints`): sem UNIQUE.

P2 backlog. Não bloqueador.

### B-NEW-52 (menu/search rate limit) AINDA ABERTO

`menu.controller.ts:33-41` ainda aceita `?q=` ilimitado (apenas check `length < 2`). `menu.service.search` faz `ILIKE '%${query}%'`. Sem rate-limit por session. P2 backlog — DoS via DB CPU saturation requires malicious actor com session válida.

### B-NEW-53 (JSON.parse defense) — 4 sites ainda abertos

```bash
$ grep -rn "JSON\.parse" apps/api/src/
apps/api/src/common/guards/session.guard.ts:39
apps/api/src/common/guards/staff-or-session.guard.ts:76
apps/api/src/modules/websocket/events.gateway.ts:140  (handleConnection branch session)
apps/api/src/modules/orders/orders.service.ts:110  (idempotency poll loop)
apps/api/src/modules/table-session/table-session.service.ts:173
```

5 sites. Round 9 fix em events.gateway.ts:238 (handleJoinSession staff branch) JÁ tem try/catch — não estendido. Round 10 não fixou. P2 backlog — corrupt cache = downtime parcial em operações específicas.

### B-NEW-55 (WS handshake rate limit) AINDA ABERTO

`events.gateway.ts:87-156` (handleConnection) sem throttle por IP. Round 9 nem round 10 endereçaram. P3 backlog — Redis backpressure via reconnect storm requer botnet.

### Migrations 040+ — não há

Sequência atual termina em 039 (drop session_token). Nenhuma migration nova adicionada em rounds 10/11.

### Schemaless tenant — requireActiveStaffId roda no schema correto ✓

`TenantConnectionProvider.query` (linha 33-47): cada call cria nuevo QueryRunner, executa `SET search_path = '${schemaName}'` via `request.tenantSchemaName` (carimbado pelo `tenant.middleware.ts:49-57`). Then user query.

`requireActiveStaffId` (caller-resolver.service.ts:118-131) injeta `TenantConnectionProvider` (request-scoped) e chama `.query(...)`. Schema correto ✓ (quando for usado — vide B-NEW-60).

### Round 11 PR cobriu 3 dos 4 achados do round 10

- ✓ B-NEW-56 (host DTOs sweep) — host.controller.ts:79-184 com `{ ...body, staffId }` em 6 sites.
- ✓ B-NEW-57 (assistant history) — assistant.controller.ts:68-81 com cookie-derived customerId.
- ✓ B-NEW-58 (late-arrival tableSessionId) — late-arrival.controller.ts:180.
- ✓ B-NEW-42 (payments SETNX) — payments.service.ts:103-157 com try/finally.
- ✗ B-NEW-56b (requireActiveStaffId wiring) — função criada mas não usada (B-NEW-60).
- ✗ B-NEW-59 (test coverage) — fora do escopo do round 11 (P3 não-bloqueador).

### Anomalia: regressão de fix vs. fix incompleto

B-NEW-60 é categoricamente "fix declarado mas não implementado" — diferente dos 3 outros achados que são famílias-irmãs simétricas. Possível causa: round 11 foi composto de 4 fixes paralelos em subdiretórios diferentes; o fix B-NEW-56b precisava trocar `requireStaffId` por `requireActiveStaffId` em 4 controllers, mas só a função foi adicionada — o "rg substituir" parece ter falhado.

**Recomendação**: round 12 deve dedicar tempo a verificar todos os comments "Round X fix B-NEW-Y" tem realmente implementação correspondente (cross-check JSdoc claim vs. implementação real).

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
| **11** | **0** | **3** | **1** | **0** | **4** |

P0 = 0 pelo terceiro round consecutivo. ✓

P1 SUBIU de 2→3 — round 11 introduziu B-NEW-60 (fix declarado mas não-wired) E não cobriu o sweep simétrico do round 10 fix (table-merge create source/target seguindo o padrão B-NEW-50/B-NEW-58).

**Categorização dos 4 achados**:
- **Fix declarado mas não-wired** (B-NEW-60): 1 P1 — requireActiveStaffId existe mas não chamada.
- **Famílias-irmãs simétricas pendentes** (B-NEW-61, 62): 2 P1 — table-merge create source/target + table.participants/decide hostCustomerId — pattern já fixado em outros endpoints.
- **IDOR não-detectado em audits anteriores** (B-NEW-63): 1 P1 — home.controller.ts customerId query param sem ownership.

Todos são pattern-recognizable: cookie-derive caller customerId/staffId em vez de aceitar do body/query.

---

## Recomendação de priorização

**P1 antes do release** (3 P1):
1. **B-NEW-60** · trocar `requireStaffId` → `requireActiveStaffId` em complaints.resolve + staff-messages.{send, listThreads, markRead}. Custo: ~10 min.
2. **B-NEW-61** · table-merge.create derive source/target da session.sessionId (rejeitar dto.sourceTableSessionId !== session.sessionId). Custo: ~15 min.
3. **B-NEW-62** · table.participants/decide derive callerCustomerId via cookie, ignorar dto.hostCustomerId. Custo: ~15 min.

**P1 (4o, novo)**:
4. **B-NEW-63** · home.controller.ts derivar customerId via cookie. Custo: ~30 min.

**Total Round 12 fix P1**: ~70 min.

**P2 backlog deferred** (já em backlog):
- B-NEW-41 (DB pool + logging)
- B-NEW-42 (payments SETNX) ✓ FECHADO
- B-NEW-51 (feedbacks/complaints UNIQUE + dedup)
- B-NEW-52 (menu/search rate limit)
- B-NEW-53 (JSON.parse try/catch — 4 sites)
- B-NEW-55 (WS handshake throttle)

Total backlog P2/P3: 5 itens — gerenciáveis pra próximas sprints.

**B-NEW-59** (test coverage) — P3 não-bloqueador, vale issue separada.

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
 11     0   3   1   0    4   ← novo achado P1, fix declarado-não-implementado
```

**Densidade total caiu drasticamente** mas **P1 ainda flutua**. Round 11 deveria ter sido inflexão final mas:
- B-NEW-60 (P1) é regression do round 11 — fix declarado falhou.
- B-NEW-61/62 (P1) são famílias-irmãs **NUNCA endereçadas** dos rounds 7-10 (não foram apontadas no audit anterior).
- B-NEW-63 (P1) é IDOR **completamente não-auditado** previamente.

**Loop NÃO PODE encerrar com 3 P1 ativos** — fixes simples (~70 min total) mas todos com impacto LGPD/audit-log. Recomendação:
1. Round 12 fixa os 4 P1 em ~70 min.
2. Round 12 audit cobre regression check + sweep final (`grep -rn "@Query.*Id\|@Param.*Id\|dto\." | filter customerId|staffId|sessionId|tableSessionId without cookie/header derivation`).
3. Se Round 12 audit retornar **0 P0/P1**, **encerrar loop**.

**Não-encerrar este round** — 3 P1 abertos, todos baixo custo. Round 12 com high probability retorna 0 P0/P1 (sweep cumulativo mais granular agora).

---

## Observações sobre regressões dos fixes recentes

### caller-resolver.requireActiveStaffId — DI correto, query no schema correto

`TenantConnectionProvider` é request-scoped → `requireActiveStaffId` que usa `tenantConn.query(...)` roda no schema do tenant carimbado pelo middleware. Confirmed safe.

### payments.requestPayment SETNX — try/finally garante release

Verificado: throw em qualquer ponto do try block (BadRequestException de duplicate pending) é capturado pelo try, finally limpa o lock. JS async/await garante propagação correta. TTL=30s fallback adicional. ✓

### assistant.controller.getHistory ignora dto.customerId

Verificado: nenhum FE legítimo em apps/web-customer/src chama `/assistant/history`. Round 11 fix sem regressão para clientes existentes. ✓

### B-NEW-49 sweep round 10/11 — staffId derivado de header em todos os endpoints staff-side com Manager/Host guard

Verificado em: complaints.respond, host.* (6 sites), staff-table-merge.force, vip.toggle, zone-pause.create/end. Apenas `complaints.resolve` + `staff-messages.*` falharam (B-NEW-60 acima).

### orders.controller.dto.customerId — defesa via session_participants validation

`orders.service.ts:200-214` valida que `customerId` passado pertence a um approved participant da session. Mesmo aceitando dto.customerId arbitrário, o service rejeita IDs alheios. **Defesa correta — não precisa migrar pra cookie-derived.** ✓

---

## Conclusão

Round 11 traz 4 achados (3 P1 + 1 P2 + 0 P3) — **densidade igual ao round 10 mas P1 subiu por causa de fix declarado-não-implementado** (B-NEW-60). Os outros 3 P1 são famílias-irmãs/IDOR não-detectados antes.

**Custo total dos 4 P1 fixes**: ~70 min de código + módulos imports.

**Loop NÃO ENCERRA neste round** — 3 P1 ativos.

Round 12 audit pós-fix terá alta probabilidade de retornar 0 P0/P1 (sweep cumulativo cobriu pattern de cookie-derivation em ≥10 endpoints; resíduos são pontuais). Backlog P2/P3 (B-NEW-41/51/52/53/55 + B-NEW-59) pode virar issues separadas pra próximas sprints — não bloqueia release post-round-12.
