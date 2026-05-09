# Round 7 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes do PR Round 7 (B-NEW-19/20/21/22/23/24/25/28/31/32 do round 5).
> Target: descobrir bugs NOVOS pós PR round 7. Foco em achados sistêmicos
> que sobreviveram aos rounds 4–7. Sem rodar — só audit estático.

## TL;DR

13 achados novos · severidades misturadas, **3 P0 + 4 P1** críticos.

- **B-NEW-33 (P0)**: `HostOrManagerGuard` (host-only.guard.ts) confia em `x-staff-role` header CLIENT-CONTROLLED. Idêntico ao bug B-NEW-22 (ManagerOnlyGuard) que foi fixado no round 7 — mas o **HostOrManagerGuard ficou esquecido**. Todo o módulo `host` (waitlist, reservations, swap, liberate, VIP via TableMenu) está com bypass total: qualquer staff com `x-staff-key` envia `x-staff-role: host` e fura todas as proteções. Mesma família, mesmo padrão errado.
- **B-NEW-34 (P0)**: WS `join:session` aceita qualquer `sessionId` quando o caller é STAFF (events.gateway.ts:148-164). Customer com session A (cookie + recognition_token) consegue se "promover" via novo handshake como staff e entrar em sala de QUALQUER session, recebendo `order:status`, `late_arrival.approved`, `host.swap_state_changed` etc. de mesas alheias. **Junta-se a B-NEW-26**: STAFF_API_KEY shared + room subscriptions sem validação per-tenant/sessão.
- **B-NEW-35 (P0)**: `POST /:slug/customer/welcome` rotaciona `recognition_token` de qualquer CPF existente quando o caller não tem o token correto (customers.service.ts:65-72). **Account takeover via CPF brute force** — sem rate limit (rate-limit do round 6 só cobre `/identify`). Atacante com session_token de qualquer mesa loops CPFs conhecidos → cookie HttpOnly recém-emitido pra qualquer customer existente. Conjugado com B-NEW-30 (rate-limit por staffId individual permite loop com lista vazada), o impacto é massivo.
- **B-NEW-36 (P1)**: `WS handleJoinStaff/handleJoinManager` checam `client.data.staffId && client.data.staffId !== data.staffId` — mas `client.data.staffId` é OPCIONAL (só existe se cliente passou `x-staff-id` no handshake). Cliente staff que NÃO setou `x-staff-id` no connect bypassa o check (`undefined && ...` é falso) e entra em qualquer `staff:<id>` ou `manager:<id>` room. Pode escutar inbox de complaint, escalation chains, manager DMs.
- **B-NEW-37 (P1)**: `recognition_token` cookie missing `secure: true` em produção (customers.controller.ts:131,211,252). `session_token` cookie tem o flag (`table-session.controller.ts:40`), mas os 3 cookies de identidade do customer NÃO. Em prod com TLS, qualquer downgrade attack ou MITM em wifi hotel/restaurant captura o cookie. **Inconsistência interna** entre cookies do mesmo projeto.
- **B-NEW-38 (P1)**: `emitStaffMessageRead` em events.gateway.ts:660-662 ainda usa `this.server.emit` GLOBAL (sem room) — mesmo bug B-NEW-3 do round 3, **NUNCA fixado**. Qualquer cliente conectado (staff OU customer com session) recebe payload `{messageId, threadId, readAt}` de read-receipts entre staffs. Operacional + cross-tenant leak (servidor não filtra por tenant na global emit).
- **B-NEW-39 (P1)**: `POST /:slug/table-merge-requests/:id/approve` ainda aceita `decidedByCustomerId` arbitrário do body (table-merge.controller.ts:88). Service (`table-merge.service.ts:175-215`) verifica que o UUID bate com `src_host` ou `tgt_host` da tabela, mas **NÃO verifica que o caller (cookie) é aquele customerId**. Customer A em mesa 5 manda `POST /merge/:id/approve {decidedByCustomerId: <UUID-do-host-real>}` e a service stamps approval — mass-junção indevida via UUID alheio. **Mesma família B-NEW-27**, especificamente não fixada no round 7.
- **B-NEW-40 (P2)**: Mongo TTL indexes inconsistentes: `mongo-init.js` usa camelCase (`tenantId, customerId, lastMessageAt`) — alinhado com o service code — mas `mongo-init.ts` (npm run mongo:init) cria indexes snake_case (`tenant_id, customer_id, last_message_at, customer_restaurant_created` com campo `restaurantId` que **nunca existe**). Quem rodar o script TS pra "garantir indexes" fica com indexes não-utilizados pelo service. Mongo TTL funciona (campo `expiresAt` existe nos dois) mas os 5 lookup indexes sao inúteis.
- **B-NEW-41 (P2)**: `databaseConfig` (config/database.config.ts) sem `extra.max` poolSize. Default node-postgres = 10. Cada request faz `dataSource.createQueryRunner()` mas com 10 conexões totais e Nest scope=REQUEST, atacante com keep-alive abre N requests slow → pool saturated → DoS. Mais sério: `logging: process.env.NODE_ENV !== 'production'` significa em DEV/staging logs TODAS as queries — incluindo INSERT customers (cpf, recognition_token), INSERT staff (pin_hash). **Logs com PII em dev/staging**.
- **B-NEW-42 (P2)**: `POST /:slug/payments` sem idempotency key (payments.controller.ts:109-125). Round 5 PR adicionou idempotencyKey opcional em `POST /:slug/orders` mas **payments é igualmente exposto a double-submit**. Service tenta dedup via SELECT (linha 99-117) mas TOCTOU clássico — 2 POSTs concorrentes ambos veem 0 pending → ambos INSERT. UNIQUE em payments table por scope ausente.
- **B-NEW-43 (P2)**: `expose:` ports em docker-compose.yml: postgres `5434:5434`, redis `6380:6379` (sem auth), mongodb `27017:27017` (sem auth). `password: postgres` hardcoded. Em dev OK, mas docker-compose copy-paste pra VPS sem firewall = exposição direta. Round 7 tirou a porta do ai-service (`expose:` em vez de `ports:`) mas as 3 DBs ficaram esquecidas. Coerência: aplicar mesma fix.
- **B-NEW-44 (P2)**: `staff/my-tables` retorna lista de TODAS as mesas ativas + `ticket_total_cents`, `is_vip`, `party_size`, `last_event` para qualquer caller que passe session válida (StaffOrSessionGuard, staff.controller.ts:68-72). Customer em mesa A vê quanto cada mesa do tenant gastou + flags VIP — operacional. Comentário do controller (linha 49-51) ja avisa "customer-side use case existe" mas não filtra por própria mesa. P3 do escopo PII mas P2 da concorrência (atacante mapeia VIPs do tenant).
- **B-NEW-45 (P3)**: `AiServiceAuthMiddleware` em main.py:103-122 fail-OPEN quando `AI_SERVICE_API_KEY` não está no env. Pra dev local sem docker. Mas se deploy esquece de setar a env (k8s secret missing, .env não carregou), middleware silenciosamente passa todos requests sem auth. Deveria fail-CLOSE com log loud. Round 7 fix corrigiu o ataque-vector porta exposta, mas o middleware está com fallback inseguro.

Detalhes abaixo.

---

## B-NEW-33 · HostOrManagerGuard tem mesmo bug do ManagerOnlyGuard pré-round-7 (P0)

**Severidade**: **P0** (collapse total da role hierarchy do módulo host).

**Source**: `apps/api/src/common/guards/host-only.guard.ts:19-31`.

```ts
@Injectable()
export class HostOrManagerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const role = req.headers['x-staff-role'];
    if (role !== 'host' && role !== 'manager') {
      throw new ForbiddenException('host- or manager-only endpoint');
    }
    return true;
  }
}
```

**Bug**: Idêntico ao B-NEW-22 que o round 7 fixou no `ManagerOnlyGuard`. Confia em `x-staff-role` header CLIENT-CONTROLLED. Não há cross-check com tabela `staff` no DB. Qualquer caller com `x-staff-key` setado seta `x-staff-role: host` e bypassa.

Round 7 atualizou `manager-only.guard.ts` pra fazer `SELECT role FROM staff WHERE id = $1 AND is_active = true` validando `role === 'manager'`. **Não atualizou** `host-only.guard.ts` — ficou com o padrão antigo.

Endpoints afetados (todos compõem `@UseGuards(StaffOnlyGuard, HostOrManagerGuard)` no `host.controller.ts:50`):
- `GET /:slug/host/tables` — mapa do salão.
- `GET /:slug/host/inbox` — fila de waitlist + reservations + swap requests.
- `POST /:slug/host/tables/:tableNumber/liberate` — fechar mesa (com modo `manual_force` que ignora pagamento pendente).
- `POST /:slug/host/tables/:tableNumber/vip` — togglar flag VIP.
- `POST /:slug/host/swap-requests` · `PATCH /:slug/host/swap-requests/:id` — mover sessão entre mesas.
- `POST /:slug/host/tables/swap` — alias legado (auto-completed).
- `GET/POST /:slug/host/waitlist` · `DELETE /:slug/host/waitlist/:id` — fila de espera.
- `GET/POST/PATCH /:slug/host/reservations[/:id]` — reservas agendadas.

**Repro hipotético**:
1. Garçom (waiter) com app legítimo já tem `x-staff-key` (compartilhado).
2. Em mod-app ou via curl: `curl -X POST /:slug/host/tables/14/liberate -H 'x-staff-key: ...' -H 'x-staff-role: host' -d '{"mode":"manual_force"}'`.
3. Mesa fechada à força (com pagamento pendente). Cliente perde acesso à comanda.
4. Idem pra criar reservas falsas, mover sessões via swap, marcar mesa como VIP, etc.

**Pior**: STAFF_API_KEY é env shared. Mesmo customer com session pode descobrir o STAFF_API_KEY (vaza em log/CI) — mas mesmo SEM essa chave, o bug é entre staff (waiter sobe pra host).

**Fix sugerido**: copiar exatamente o pattern do `ManagerOnlyGuard` pós-round-7:
1. Injetar `TenantConnectionProvider`.
2. Ler `x-staff-id` header (UUID), validar shape.
3. Query `SELECT role FROM staff WHERE id = $1 AND is_active = true`.
4. Aceitar `role === 'host' || role === 'manager'`.

---

## B-NEW-34 · WS join:session aceita sessionId arbitrário pra staff (P0)

**Severidade**: **P0** (cross-tenant + cross-session WS leak).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:148-164`.

```ts
@SubscribeMessage('join:session')
handleJoinSession(
  @ConnectedSocket() client: AuthedSocket,
  @MessageBody() data: { sessionId: string },
) {
  if (
    client.data.authType === 'session' &&
    client.data.sessionId !== data.sessionId
  ) {
    client.emit('error', { message: 'Session mismatch' });
    return;
  }

  const room = `session:${data.sessionId}`;
  client.join(room);
  // ...
}
```

**Bug**: O check `if (client.data.authType === 'session' && ...)` SÓ falha quando o caller é session E o sessionId não bate. Pra **STAFF callers** (`authType === 'staff'`), o branch nem entra — staff sempre passa. Combinado com B-NEW-26 (`join:tenant` aceita slug arbitrário) e o fato de `STAFF_API_KEY` ser global env, qualquer staff de qualquer tenant entra em qualquer `session:<UUID>` e recebe:
- `order:status` quando status muda em qualquer mesa.
- `late_arrival.approved` / `late_arrival.expired` por mesa.
- `table_merge.created` / `table_merge.approved` (ambos lados).
- `host.table_liberated` / `host.swap_state_changed` / `host.swap_requested` / `host.vip_flagged`.
- `session.flag_changed` (vip/allergy/reincidente).

Cross-tenant leak: payload do `late_arrival.approved` carrega `requesterCustomerId` UUID — operacional do outro tenant.

**Repro**:
1. Staff client de tenant A loga via WS handshake (`x-staff-key` + STAFF_API_KEY).
2. `socket.emit('join:session', { sessionId: '<uuid-de-mesa-do-tenant-B>' })`.
3. Server: `client.join('session:<uuid-de-tenant-B>')`. **Sem validação**.
4. Cliente recebe TODOS os eventos `emitToSession(sessionId, ...)` daquela mesa do tenant B — order status, host swap, late arrival, etc.

**Fix sugerido**:
1. Pra `authType === 'staff'`: validar via DB que `data.sessionId` pertence ao mesmo tenant do staff (precisa membership lookup; ver B-NEW-26 fix).
2. Pra `authType === 'session'`: já tem o check correto. Manter.
3. Pra unauth: rejeitar (handleConnection já rejeita, mas defesa em depth).

---

## B-NEW-35 · /customer/welcome account takeover via CPF brute force (P0)

**Severidade**: **P0** (account takeover · LGPD impact).

**Source**:
- `apps/api/src/modules/customers/customers.controller.ts:195-231` (no rate limit, SessionGuard apenas).
- `apps/api/src/modules/customers/customers.service.ts:53-83`.

```ts
// service.welcome:
if ((existing as unknown[]).length > 0) {
  const customer = (existing as Record<string, unknown>[])[0];
  customerId = customer.id as string;
  resolvedName = customer.name as string;
  const storedToken = customer.recognition_token as string;
  isReturning = true;

  const tokenMatches =
    callerRecognitionToken != null && callerRecognitionToken === storedToken;

  if (tokenMatches) {
    recognitionToken = storedToken;
  } else {
    recognitionToken = uuidv4();   // ← rotaciona
    wasReclaim = true;
    await this.tenantConn.query(
      'UPDATE customers SET recognition_token = $1, ... WHERE id = $2',
      [recognitionToken, customerId],
    );
    // ...
  }
```

**Bug**: Quando atacante manda CPF de OUTRO customer existente E não tem o token correto (caso comum de "novo usuário em outra mesa"), o serviço:
1. Gera NOVO recognition_token via `uuidv4()`.
2. UPDATE no DB sobrescrevendo o token do customer real.
3. Retorna o token via cookie HttpOnly (response: `wasReclaim: true`).

Resultado: legítimo customer perde sua identidade (token antigo invalidado). Atacante agora HOLDA o cookie do customer real e pode chamar `/recognize`, `/lgpd-requests` (B-NEW-23 pré-round-7 era erasure direto), `/chat-history`, late-arrival como ele.

**Sem rate limit no /welcome**: round 6 (B-NEW-11) adicionou rate-limit IP em `/identify` (5/15min). Round 7 não estendeu pra `/welcome`. Atacante:
1. Scaneia QR público (table_session URLs são públicos via JWT signed) → ganha session_token.
2. Pula `/welcome` em loop com CPFs conhecidos (LinkedIn, leak, social) → cada match retorna cookie do customer real.
3. Sem 429 — restrição é apenas `@MaxLength(11)` + `validateCpf()` (Brazilian checksum).

**Espaço de busca** = 11 dígitos = 10^11 com checksum DV (~10^9 válidos). Pra CPF brasileiro real, lista pública de leaks (Boa Vista, Serasa) tem ~200M CPFs validados. Atacante itera-os.

**Comparar com B-NEW-11** (round 6 fix): só protegeu `/identify`. **`/welcome` é mais perigoso**: rotaciona o token (não só lookup).

**Fix sugerido**:
1. Rate limit IP no `/welcome` igual ao `/identify` (5/15min, lock 15min).
2. **Mais defensivo**: NÃO rotacionar token quando `tokenMatches === false` E o customer já existe — em vez disso, retornar 409 Conflict ("CPF já cadastrado em outro device") + UI manda customer fazer flow de recovery (e.g., e-mail link). Round atual silenciosamente "reclama" o CPF.
3. Considerar 2FA-like step pra reclaim (e-mail confirm code) — mesmo cliente legítimo que perdeu o cookie tem fricção; atacante perde caminho.

---

## B-NEW-36 · WS join:staff/join:manager bypass via missing client.data.staffId (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:201-216` + `:224-239`.

```ts
@SubscribeMessage('join:staff')
handleJoinStaff(...) {
  if (client.data.authType !== 'staff') { ... }
  if (client.data.staffId && client.data.staffId !== data.staffId) {
    client.emit('error', { message: 'Staff id mismatch' });
    return;
  }
  client.join(`staff:${data.staffId}`);
}
```

**Bug**: `client.data.staffId` é OPCIONAL no handshake (events.gateway.ts:92-99):

```ts
const staffId = (client.handshake.headers['x-staff-id'] as string) ?? ...;
if (staffId) client.data.staffId = staffId;   // ← opcional
```

Se cliente CONNECTA sem `x-staff-id` (válido pelo handshake — só STAFF_API_KEY é exigido), `client.data.staffId` é `undefined`. Então o check `client.data.staffId && ...` é `false && ...` = `false` (curto-circuita) e o branch de erro NÃO entra. Cliente faz `join:staff` em qualquer ID arbitrário.

Mesmo bug em `handleJoinManager` (linha 232-235).

**Repro**:
1. Atacante (staff de tenant A, ou alguém com STAFF_API_KEY vazada) conecta WS sem passar `x-staff-id` no handshake.
2. `socket.emit('join:staff', { staffId: '<uuid-do-manager-X>' })`.
3. Server: `client.join('staff:<uuid-do-manager-X>')`.
4. Cliente recebe `escalation.created`, `complaint.received`, `staff_message.received`, `zone_pause.started/ended` direcionados àquele manager. Inbox alheio em tempo real.

**Fix sugerido**: rejeitar conexão WS staff que NÃO passa `x-staff-id` E `x-staff-role` no handshake (handleConnection). Tornar ambos obrigatórios. Validar staffId via DB (`SELECT role FROM staff WHERE id = $1 AND is_active = true`) no connect. Ou no minimum: se `client.data.staffId` ausente, rejeitar `join:staff` / `join:manager` com erro.

---

## B-NEW-37 · recognition_token cookies sem secure: true (P1)

**Severidade**: **P1**.

**Source**:
- `apps/api/src/modules/customers/customers.controller.ts:131-136` (`/identify`).
- `apps/api/src/modules/customers/customers.controller.ts:211-216` (`/welcome`).
- `apps/api/src/modules/customers/customers.controller.ts:252-257` (`/recognize`).

```ts
res.cookie('recognition_token', result.recognitionToken, {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: RECOGNITION_COOKIE_MAX_AGE,
  // ← FALTA: secure: process.env.NODE_ENV === 'production'
});
```

**Comparar com session_token cookie** em `table-session.controller.ts:38-44`:
```ts
res.cookie('session_token', session.sessionId, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',   // ← está aqui
  sameSite: 'lax',
  ...
});
```

**Bug**: `recognition_token` é cookie de identidade persistente (1 ano TTL: 365d, mais longo que session 4h). Em prod com TLS, falta `secure: true` significa browser ENVIA o cookie em requests HTTP plain (downgrade attack via captive portal, MITM em wifi público de restaurante/hotel, redirect HTTP→HTTPS lento).

`recognition_token` rouba = identidade permanente do customer, em qualquer mesa do tenant.

**Inconsistência interna** entre cookies do mesmo projeto (session_token tem secure, recognition_token NÃO) é sinal de fix incompleto.

**Fix sugerido**: adicionar `secure: process.env.NODE_ENV === 'production'` nos 3 sites (1 linha cada). 5 minutos de fix.

---

## B-NEW-38 · emitStaffMessageRead global broadcast (P1)

**Severidade**: **P1** (cross-tenant + cross-customer leak — bug ANTIGO, NUNCA fixado).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:660-662`.

```ts
emitStaffMessageRead(payload: WsStaffMessageRead['payload']) {
  this.server.emit('staff_message.read', payload);   // ← global
}
```

Comentário acima (linhas 654-658) reconhece o problema mas não fixou:
> "Broadcast on the global namespace so any subscriber holding the thread can flip the UI. Mirrors the simple `complaint.read` pattern — narrower routing can be layered on later if the fan-out becomes noisy."

`complaint.read` ATUAL JÁ TEM routing (linha 610-619: `tenant:${slug}` + `manager:${managerId}`). Comentário desatualizado. **Apenas `staff_message.read` ficou global.**

**Bug**: `this.server.emit` (sem `.to(room)`) envia pra TODOS os sockets conectados, incluindo:
- Staff de tenant B/C/D (cross-tenant leak).
- Customers conectados via `session_token` (B-NEW-3 anotou isso já em round 3).

Payload `WsStaffMessageRead`: `{messageId, threadId, readAt, byStaffId}`. Operational: customer aprende quando staff lê mensagens internas. Cross-tenant: tenant B sabe quando staff de tenant A leu (se mesmo backend).

Round 5 e Round 7 commits NÃO tocaram esse helper. Round 3 reportou o problema (B-NEW-3); round 5 anotou que ainda existia ("Outras observações" → "B-NEW-3 ainda existe"). **Round 7 também não.**

**Fix sugerido**: copiar pattern do `emitComplaintRead` — routing pra `tenant:${slug}` + `manager:${assignedManagerId}` ou similar. Precisa adicionar `slug` + `staffId` ao payload se ainda não tem.

---

## B-NEW-39 · table-merge approve aceita decidedByCustomerId arbitrário (P1)

**Severidade**: **P1** (junção forçada via UUID alheio).

**Source**:
- `apps/api/src/modules/table-merge/table-merge.controller.ts:80-99`.
- `apps/api/src/modules/table-merge/table-merge.service.ts:175-243`.

Controller:
```ts
@Post(':id/approve')
@UseGuards(SessionGuard)
async approve(
  @Param('slug') slug: string,
  @Param('id') id: string,
  @Body() dto: DecisionDto = {},
) {
  return this.service.approve(id, dto.decidedByCustomerId, slug);
}
```

Service em `:175-215`:
```ts
async approve(id: string, decidedByCustomerId?: string, slug?: string) {
  if (!decidedByCustomerId) throw 400;
  // ... fetch src_host, tgt_host
  if (src_host && src_host === decidedByCustomerId) {
    side = 'a';
  } else if (tgt_host && tgt_host === decidedByCustomerId) {
    side = 'b';
  } else throw 403;
  // UPDATE stamps approved_by_a_at OR approved_by_b_at
}
```

**Bug**: Service valida que `decidedByCustomerId` BATE com um host_customer_id (src ou tgt), mas **NÃO valida que o caller (cookie recognition_token) é aquele customerId**. Customer A em mesa 5 sabe (via leak ou social) o customerId do host da mesa 7. Manda:

```
POST /:slug/table-merge-requests/:id/approve
Body: {decidedByCustomerId: '<UUID-do-host-real>'}
```

Service vê: UUID bate com tgt_host → aceita → stamp `approved_by_b_at`. Quando ambos lados forem stamped (atacante repete pro lado A), status flipa pra `approved` → mesas se juntam contra a vontade do verdadeiro host.

**Round 6** fixou o mesmo padrão em `late-arrival.controller` via cookie ownership check (`assertHostOrThrow`). **Round 7 não estendeu pra table-merge.**

**Repro**:
1. Customer A em mesa 5 (session_token + recognition_token válidos).
2. Coleta `customerId` do host de mesa 7 via `GET /participants` (table-session.controller.ts) ou via `GET /table-merge-requests` (que era público pré-round-7, mas pode vazar via outros endpoints WS).
3. Cria merge `POST /merge {source: <self>, target: <mesa-7>, requestingCustomerId: <self>}`. Service.create cria pending.
4. Approve A: `POST /merge/:id/approve {decidedByCustomerId: <self>}`. OK.
5. Approve B: `POST /merge/:id/approve {decidedByCustomerId: <UUID-host-mesa-7>}`. **Service não checa cookie**. Aceita.
6. Merge consumed → mesas juntadas → atacante vê comanda da mesa 7 + chat.

**Fix sugerido** (mesmo pattern de B-NEW-23 fix em LGPD):
1. Controller resolve `customerId` do cookie via `customers.resolveByRecognitionToken`.
2. Compara com `dto.decidedByCustomerId` — se diferente, 403.
3. Idealmente, REMOVER `decidedByCustomerId` do DTO (sempre derivar do cookie).

---

## B-NEW-40 · Mongo init scripts inconsistentes (camelCase vs snake_case) (P2)

**Severidade**: **P2** (perf + LGPD reliability).

**Source**:
- `packages/database/mongo-init.js:24-32` (Docker first-boot).
- `packages/database/scripts/mongo-init.ts:23-89` (`npm run mongo:init`).

`mongo-init.js` (alinhado com service):
```js
db.chat_threads.createIndex({ tenantId: 1, customerId: 1, lastMessageAt: -1 });
db.chat_messages.createIndex({ threadId: 1, createdAt: 1 });
```

`mongo-init.ts`:
```ts
const THREAD_INDEXES: IndexDef[] = [
  { spec: { tenant_id: 1, customer_id: 1, last_message_at: -1 } },  // snake_case
  { spec: { tenant_id: 1, table_session_id: 1 } },                  // snake_case
  { spec: { customer_id: 1 } },                                     // snake_case
  { spec: { customerId: 1, restaurantId: 1, createdAt: -1 } },      // ← restaurantId NUNCA armazenado
  { spec: { created_at: 1 } },                                      // snake_case (service usa createdAt)
  { spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },   // ← OK
];
```

**Bug**: `chat-history.service.ts:90, 99-102` usa CAMELCASE: `tenantId`, `customerId`, `threadId`, `expiresAt`. Mongo é schemaless — campos snake_case dos indexes do `mongo-init.ts` simplesmente não EXISTEM nos docs gravados. Indexes:
- `tenant_customer_lastmsg`: snake_case → unused.
- `tenant_table_session`: idem (e `table_session_id` nem é gravado).
- `customer_id` (LGPD bulk-delete): snake_case → unused.
- `customer_restaurant_created`: parcialmente camelCase, mas usa `restaurantId` que **service nunca armazena** (service usa `tenantId` em vez disso, ver linha 100).
- `created_at`: snake_case → unused.

Resultado:
1. **LGPD instant erasure** (linha 67-69 `mongo-init.ts`: "CRITICAL: LGPD instant erasure relies on this index"). O comentário diz que erasure usa `tenant_customer` index (snake_case) — mas o service `deleteAllForCustomer` (chat-history.service.ts:246) faz `find({ customerId })` (camelCase). Sem index → COLLECTION SCAN. Em tenant com milhões de docs, deleteAllForCustomer fica lento → cliente aguarda 30s+ pra erasure completar.
2. **TTL** funciona (campo expiresAt mesmo nos dois).
3. **Listing** (`listThreads`, linha 145-156 service: `find({ customerId, tenantId }).sort({ lastMessageAt: -1 })`) — performance ruim em produção sem index `tenantId+customerId+lastMessageAt`.

`mongo-init.js` (Docker first-boot) tem o índice CORRETO (camelCase). Mas só roda em volume vazio. Tenants existentes com volume persistido têm os indexes de `mongo-init.js` SE rodaram do zero, ou os indexes errados de `mongo-init.ts` SE rodaram `npm run mongo:init`.

**Fix sugerido**:
1. Padronizar `mongo-init.ts` pra camelCase (alinhado com service):
   ```ts
   { spec: { tenantId: 1, customerId: 1, lastMessageAt: -1 } },
   { spec: { customerId: 1 } },                                  // LGPD erasure
   { spec: { tenantId: 1, customerId: 1 } },                     // bulk delete cross-tenant
   ```
2. **Cleanup**: remover indexes legacy snake_case (drop ou skip se não existem).
3. CI step que checa `mongo-init.js` e `mongo-init.ts` têm specs idênticos.

---

## B-NEW-41 · DB pool size + query logging em dev (P2)

**Severidade**: **P2**.

**Source**: `apps/api/src/config/database.config.ts`.

```ts
export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://...',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  // ← FALTA: extra: { max: N }
};
```

**Bug duplo**:

1. **Pool size**: sem `extra.max`, node-postgres default = 10. Combinado com `TenantConnectionProvider` (scope=REQUEST, cria runner per-query) e `TtlTickService` rodando cron jobs, pool satura facilmente. Atacante com 10 conexões keep-alive + slow query (e.g., `/dashboard/revenue?days=365`) trava o pool. Outros requests legítimos: 503.

2. **Logging em dev/staging**: `logging: NODE_ENV !== 'production'` = TODAS as queries no stdout. Inclui:
   - `INSERT INTO customers (name, cpf, ...) VALUES ('Maria Silva', '12345678901', ...)` — **CPF em texto puro**.
   - `INSERT INTO staff (..., pin_hash) VALUES (..., 'sha256...')` — pin_hash exposto.
   - `UPDATE customers SET recognition_token = 'uuid' WHERE id = ...`.
   
   Em staging com retenção de logs (Datadog, CloudWatch), CPF + tokens vão pra storage de longa duração — LGPD violation se devs acessam logs sem necessidade legítima.

**Fix sugerido**:
1. Adicionar `extra: { max: 30 }` (suficiente pra ~10 req/s em workload normal).
2. Mudar logging pra `'error'` ou array seletivo `['error', 'schema']` mesmo em dev. Pra debugar SQL específico, usar `EXPLAIN` interativo, não log massivo.
3. CI lint que falha se `logging: true` for usado.

---

## B-NEW-42 · POST /payments sem idempotency key (P2)

**Severidade**: **P2**.

**Source**: `apps/api/src/modules/payments/payments.controller.ts:109-125` + `payments.service.ts:99-117, 129-147`.

DTO:
```ts
class RequestPaymentDto {
  @IsIn(['table', 'individual']) mode!: ...;
  @IsOptional() visitId?: string;
  @IsIn(['pix', 'card', 'cash', 'credit', 'debit']) method!: string;
  // ← FALTA: idempotencyKey
  // ...
}
```

Service:
```ts
const existing = await this.tenantConn.query(
  `SELECT id, expires_at FROM payments
   WHERE table_session_id = $1 AND status = 'pending' ...`,
  ...,
);
// SELECT-then-INSERT: TOCTOU window aberto.
// ...
INSERT INTO payments ...
```

**Bug**: Round 5 PR adicionou `idempotencyKey` em `POST /:slug/orders` (orders.controller.ts:96-103, orders.service.ts:84-109). Mesmo pattern foi necessário pra `POST /:slug/payments` (customer double-tap "Pagar" → dois Pix gerados → confusão de qual usar). **Não foi adicionado.**

Service tenta dedup via SELECT pending count, mas dois POSTs concorrentes ambos veem 0 pending → ambos INSERT. Sem UNIQUE em payments por scope (`table_session_id, visit_id WHERE status='pending'`), Postgres aceita ambos.

Resultado: cliente vê 2 Pix com QR diferentes, paga um, o outro vira cobrança duplicada se PSP webhook bater nos dois.

**Fix sugerido**:
1. Adicionar `idempotencyKey?: @IsOptional() @IsUUID()` no DTO. Service: `redis.set(NX EX) + SELECT cache pra dedup`.
2. Adicionar UNIQUE partial em `payments(table_session_id, visit_id) WHERE status='pending'` (migration).
3. Capturar erro 23505 no service e retornar pagamento existente.

Mesma fix idempotencyKey aplicável a `POST /:slug/complaints` (double-tap submit reclamação) e `POST /:slug/feedbacks` (já tem dedup por visitId, mas sem idempotency key).

---

## B-NEW-43 · DB ports expostas em docker-compose (P2)

**Severidade**: **P2**.

**Source**: `docker-compose.yml:5-7, 23-24, 36-37`.

```yaml
postgres:
  ports: - "5434:5434"
redis:
  ports: - "6380:6379"
mongodb:
  ports: - "27017:27017"
```

**Bug**:
1. **Postgres** com user/pass `postgres:postgres` hardcoded (linha 9-10) — exposto na host.
2. **Redis** sem auth (default mode, sem `requirepass`) — qualquer um conecta.
3. **MongoDB** sem auth (sem `MONGO_INITDB_ROOT_USERNAME`) — anonymous read/write.

Em dev local: OK. Em prod (alguém faz `docker-compose -f docker-compose.yml up` em VPS sem firewall), 3 datastores vazam pra internet:
- Postgres: CPFs + recognition_tokens + pin_hashes + ordens com totais financeiros.
- Redis: session tokens + assistant rate limit + PIN throttle.
- MongoDB: chat history (PII conversation).

Round 7 corrigiu o ai-service (`expose:` em vez de `ports:`). **Coerência: aplicar mesma fix nas DBs.** Acesso via `docker exec` ou rede interna do compose já funciona.

**Fix sugerido**:
1. Trocar `ports:` por `expose:` em postgres, redis, mongodb (acesso só via docker network).
2. Adicionar `MONGO_INITDB_ROOT_USERNAME/PASSWORD` no MongoDB.
3. Adicionar `requirepass` no Redis (env via .env).
4. Postgres: trocar `password: postgres` por env var obrigatória sem fallback.

Pra dev workflow: documentar que `docker exec -it restaurant-postgres psql -U postgres -p 5434` é o caminho oficial (ou `npm run db:psql` script).

---

## B-NEW-44 · /staff/my-tables vaza dados de TODAS as mesas do tenant (P2)

**Severidade**: **P2** (operational + VIP detection).

**Source**: `apps/api/src/modules/staff/staff.controller.ts:68-72` + service.ts:72-130.

```ts
@Get('my-tables')
@UseGuards(StaffOrSessionGuard)   // ← aceita session
async myTables() {
  return this.staffService.listActiveTables();
}
```

Comentário na linha 49-51:
> "`my-tables` mantém StaffOrSessionGuard porque é a única rota onde customer-side use case existe (cliente pode listar mesas ativas pra contexto de UI)."

Mas o service em `staff.service.ts:72-130` retorna lista DE TODAS AS MESAS ATIVAS DO TENANT, sem filtro por `table_session_id` do caller. Cada row tem:
- `id` (table_session_id),
- `label`, `table_code`, `party_size`, `capacity`,
- **`ticket_total_cents`** — quanto a mesa gastou,
- `opened_min`,
- `last_event` (last status transition),
- **`is_vip`** — flag VIP da sessão.

**Repro**: Customer em mesa A (session válida) faz `GET /:slug/staff/my-tables`. Recebe lista de TODO o tenant. Identifica mesas VIP (flag), mesas com ticket alto (R$ 500+ → cliente premium), padrões de uso.

Casos de abuso:
- Concorrente do restaurante mapeia ocupação real-time.
- Atacante identifica mesa VIP pra approach social engineering ("vi que você é VIP, posso te oferecer...").
- LGPD: ticket value é dado de consumo do customer (pode-se inferir hábito).

**Fix sugerido**:
1. Pra path session: filtrar `WHERE ts.id = caller.sessionId` (apenas a própria mesa).
2. Pra path staff: livre como hoje (waiter precisa do mapa).
3. Refatorar pra `listActiveTables(callerSessionId?: string)` — staff passa null, customer passa próprio sessionId.

---

## B-NEW-45 · AI service auth fail-open quando env ausente (P3)

**Severidade**: **P3**.

**Source**: `services/ai-service/main.py:103-122`.

```python
class AiServiceAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _PUBLIC_PATHS or path.startswith("/static"):
            return await call_next(request)

        expected = os.environ.get("AI_SERVICE_API_KEY")
        if not expected:
            # Sem env configurada → fail-open em dev (CI/local sem docker).
            return await call_next(request)   # ← passa sem auth

        provided = request.headers.get("x-ai-service-key", "")
        if not provided or not compare_digest(provided, expected):
            return Response(status_code=401, ...)
        return await call_next(request)
```

**Bug**: Round 7 fix (B-NEW-25) é correto na prática (Docker compose seta a env), mas o fallback é **fail-OPEN**. Cenários:
- Deploy com k8s secret faltando → `AI_SERVICE_API_KEY` é `""` → middleware passa todos requests.
- `.env` mal carregado em pipeline CI/CD → mesmo.
- Dev rodando `uvicorn` direto sem `.env` → mesmo (intencional, mas perigoso).

**Fix sugerido**:
1. Fail-CLOSE com exception fatal no startup se `AI_SERVICE_API_KEY` ausente em `os.environ` (`@app.on_event("startup")` raise).
2. Pra dev local sem docker, usar valor padrão CONHECIDO (`dev-ai-key-NOT-FOR-PROD`) em vez de fail-open silencioso.
3. Log loud quando middleware bypassa (linha 113): `logger.error("AI_SERVICE_API_KEY ausente — middleware DESLIGADO. Apenas dev/CI.")`.

---

## Outras observações (não-achados)

### Migrations 035-039 — idempotência OK

- 035: `CREATE TABLE IF NOT EXISTS` em todas as 3 (waitlist_entries, reservations, table_swap_requests). Idempotente.
- 036: `ADD COLUMN IF NOT EXISTS` × 2. Idempotente.
- 037: bloco DO complexo com `EXISTS` checks pra cada constraint/column. Idempotente. Edge case: `NOT NULL after backfill` (linha 52-54) só roda se a column foi criada nesta migration (`IF NOT has_source_col`); rerun não dispara o ALTER NOT NULL.
- 038: `CREATE UNIQUE INDEX IF NOT EXISTS`. Idempotente.
- 039: `DROP COLUMN IF EXISTS` (column dead). Idempotente. Sem rollback path mas a coluna nunca foi lida.

Migration 032 (B-NEW-29) ainda destrutiva — DEFERRED do round 5. Não foi tocada.

### updateStatus session ownership — fixed em round 7

Round 7 PR fixou B-NEW-24: `orders.service.ts:695-713` valida `actorType + sessionTableId === tableSessionId` quando customer faz updateStatus, e restringe transição apenas pra `cancelled`. Bug família resolvido aqui.

### LGPD ownership — fixed em round 7

`lgpd.controller.ts` agora deriva customerId do cookie via `assertHostOrThrow`-equivalent (`resolveCallerCustomerId`). B-NEW-23 resolved.

### Dashboard guard — fixed em round 7

`@UseGuards(StaffOrSessionGuard)` substituído por `StaffOnlyGuard`. B-NEW-20 resolved.

### Deliveries guard — fixed em round 7

Idem. B-NEW-21 resolved.

### Staff CRUD guard — fixed em round 7

POST/PATCH/DELETE em `staff.controller.ts:79-95` usam `StaffOnlyGuard`. B-NEW-19 resolved.

### B-NEW-26 (WS join:tenant slug check) ainda aberto

Não fixado em round 7. Continua deferido.

### B-NEW-27 parcialmente fixado em round 7

Round 7 fixou:
- B-NEW-23 (LGPD): customerId via cookie.
- B-NEW-24 (orders updateStatus): actorType + sessionTableId.

Não fixou:
- `POST /:slug/complaints` (complaints.controller.ts:121: `customerId: dto.customerId`).
- `POST /:slug/order-ratings` (order-ratings.controller.ts:52: idem).
- `POST /:slug/late-arrival-requests` CREATE (late-arrival.controller.ts:156: `customerId: dto.customerId`).
- `POST /:slug/feedbacks` (feedbacks.controller.ts:83).
- `POST /:slug/waiter-calls` (waiter-calls.service.ts:117 lê dto.customerId).
- `POST /:slug/staff-messages` (staff-messages.controller.ts:62: `dto.senderStaffId`).
- `POST /:slug/host/*` (host/dto/host.dto.ts: dto.staffId em ToggleVipDto, LiberateTableDto, CreateSwapDto, UpdateSwapDto).
- **B-NEW-39 (table-merge approve)**: novo achado nesta auditoria.

Família ampla. Sugestão: spawn task pra "padronizar ownership pattern em todos POST/PATCH com IDs de identidade".

### `recognize` body-fallback — risk reduzido pós B-NEW-28 fix

Round 7 fix removeu `recognitionToken` do response body de `/welcome` e `/recognize`. Body-fallback do `/recognize` (`dto.recognitionToken ?? cookie`) ainda existe (customers.controller.ts:242), mas sem o token vazar no body de respostas anteriores, atacante precisa OUTRO vetor pra obter o token (XSS direto, network sniff). Aceitável risco residual.

### CORS WS namespace — staff vs customer hardcoded localhost

events.gateway.ts:60-63: `origin: ['http://localhost:3003', 'http://localhost:3002']`. Em prod precisa env var (já reportado em round anterior, mantém aberto).

---

## Comparação com Round 5 e Round 6

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 (B-NEW-8..18) |
| 5 | 6 | 4 | 3 | 1 | 14 (B-NEW-19..32) |
| 7 | **3** | **4** | **5** | **1** | **13 (B-NEW-33..45)** |

Round 7 PR cobriu 10 dos 14 achados do round 5. 4 ficaram deferred (26, 27, 29, 30). O que aparece de novo aqui é **família-irmã** dos fixes:
- Fix do ManagerOnlyGuard não foi replicado no HostOrManagerGuard → B-NEW-33 (P0).
- Fix do `/identify` rate-limit não foi estendido pro `/welcome` → B-NEW-35 (P0).
- Fix do `recognitionToken` body removal não atualizou os cookies pra `secure: true` → B-NEW-37 (P1).
- Fix do `late-arrival approve ownership` não foi replicado no `table-merge approve` → B-NEW-39 (P1).

**Pattern**: fixes pontuais em bugs específicos sem auditoria sistêmica de "todos os endpoints com mesmo padrão" deixa rastros. Sugestão: round 8 fazer um sweep "single fix → todos similares" pra encerrar família B-NEW-27 e ManagerOnlyGuard-style guards.

---

## Recomendação de priorização

**Bloqueadores P0** (devem ir no PR Round 8):
1. **B-NEW-33** · HostOrManagerGuard role check via DB (mesma fix de B-NEW-22).
2. **B-NEW-34** · WS `join:session` validar tenant pra staff.
3. **B-NEW-35** · `/welcome` rate limit + bloquear silent reclaim de CPF alheio.

**P1 antes de release**:
4. **B-NEW-36** · WS `join:staff/manager` exigir `client.data.staffId` setado.
5. **B-NEW-37** · `secure: true` em recognition_token cookies.
6. **B-NEW-38** · `emitStaffMessageRead` route por tenant.
7. **B-NEW-39** · `table-merge approve` ownership via cookie (pattern do late-arrival).

**P2/P3 backlog**:
8. **B-NEW-40** · Mongo init scripts unificados em camelCase.
9. **B-NEW-41** · DB pool size + remover query logging em dev/staging.
10. **B-NEW-42** · idempotency key em payments (e talvez complaints/feedbacks).
11. **B-NEW-43** · DB ports `expose:` em vez de `ports:`.
12. **B-NEW-44** · `/staff/my-tables` filter por session no path customer.
13. **B-NEW-45** · ai-service middleware fail-CLOSE.

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | **3** | **4** | **5** | **1** | **13** |

Round 7 audit revela achados sistêmicos novos (não cobertos por rounds 4-7) com volume similar ao round 5. Densidade de P0 cai de 6→3 — sintoma positivo de que rounds anteriores fecharam os low-hanging — mas as 3 P0 que ficaram são todas **família-irmã** de fixes recentes não replicados.
