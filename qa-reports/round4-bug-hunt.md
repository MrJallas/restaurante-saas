# Round 4 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes Cat 1-N da Frente A do round 4.
> Target: descobrir bugs novos pós-merge do PR #26 (round 3). Foco em
> guards faltando/permissivos demais, race conditions PG, IDOR, leaks,
> Mongo TTL pipeline. Sem rodar — só audit estático.

## TL;DR

11 achados novos · severidades misturadas, **3 P0 + 2 P1** críticos.

- **B-NEW-8 (P0)**: `POST/PATCH/DELETE /:slug/promotions/*` aceita `StaffOrSessionGuard` — qualquer customer com session ativa pode criar/editar/deletar promoções (regressão do "fix" round 3 que afirmou ser staff-only). 100%-off coupon attack viável.
- **B-NEW-9 (P0)**: `DELETE /:slug/chat-history?customerId=X` aceita customerId via query — customer A apaga TODO o histórico LGPD do customer B. Mass-destruction sem ownership check.
- **B-NEW-10 (P0)**: `mongo-init.js` inicializa DB `chat_history` mas a API conecta em `restaurant_chat` (env `MONGODB_DB`). TTL/indexes nunca aplicam — chat docs ficam para sempre, índices ausentes.
- **B-NEW-11 (P1)**: `POST /:slug/customer/identify` é unauth e retorna `recognitionToken` se CPF bater — bruteforce CPF + auto-login direto. PII leak + account hijack.
- **B-NEW-12 (P1)**: `POST /:slug/late-arrival-requests/:id/approve|reject` aceita staffId/customerId via body com só SessionGuard — customer auto-aprova própria entrada ou rejeita pedido alheio.
- **B-NEW-13 (P1)**: `claimOrder` em deliveries.service.ts:12 + ausência de UNIQUE em `order_deliveries(order_id)` (migration 009) — race condition: 2 garçons claim mesmo pedido simultaneamente, ambos aceitos.
- **B-NEW-14 (P1)**: `acknowledgeCall` em waiter-calls.service.ts:194 faz SELECT-then-UPDATE sem CAS — race entre 2 garçons fazendo "atender" no mesmo chamado.
- **B-NEW-15 (P2)**: `chat-history` TTL hardcoded em 90d (chat-history.service.ts:17) mas docs LGPD especificam 30d — discrepância de compliance.
- **B-NEW-16 (P2)**: `GET /:slug/chat-history/threads/:threadId/messages` sem ownership check — customer enumera/lê threads alheias (threadId é determinístico: `${tenantId}:${customerId}:${YYYY-MM-DD}`).
- **B-NEW-17 (P2)**: `GET /:slug/feedbacks?visitId=X` retorna feedback de qualquer visit — sem validação de ownership por session.
- **B-NEW-18 (P3)**: `table_sessions.session_token` (uuid coluna em DB) é gerado no INSERT mas nunca usado — o front carrega `table_sessions.id` como token. Coluna morta.

Detalhes abaixo.

---

## B-NEW-8 · Promotions endpoints aceitam customer session (P0)

**Severidade**: **P0**.

**Source**: `apps/api/src/modules/promotions/promotions.controller.ts:60-76`.

```ts
@Post()
@UseGuards(StaffOrSessionGuard)
async create(@Body() dto: CreatePromotionDto) { ... }

@Patch(':id')
@UseGuards(StaffOrSessionGuard)
async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) { ... }

@Delete(':id')
@UseGuards(StaffOrSessionGuard)
async delete(@Param('id') id: string) { ... }
```

**Bug**: `StaffOrSessionGuard` aceita `x-staff-key` OU `x-session-token` (ver `apps/api/src/common/guards/staff-or-session.guard.ts:33-65`). O comentário do controller (linha 39-44) afirma "agora exigem `x-staff-key`" mas isso é falso — sessions também passam.

**Repro hipotético**:
1. Customer escaneia QR de mesa em `/restaurante-x` → ganha `session_token`.
2. Customer faz `PATCH /restaurante-x/promotions/<id-existente>` com `discountType: 'percentage', discountValue: 100`.
3. Customer cria pedido → pedido ganha 100% de desconto.

OU pior: customer DELETA todas as promoções vigentes do restaurante.

**Fix sugerido**: trocar `StaffOrSessionGuard` por `StaffOnlyGuard` (pra POST/PATCH/DELETE). Manter GET público se quiser (cardápio precisa ler descontos sem login).

---

## B-NEW-9 · Chat-history DELETE bulk via query param (P0)

**Severidade**: **P0** (LGPD violação + destrutivo).

**Source**: `apps/api/src/modules/chat-history/chat-history.controller.ts:60-64`.

```ts
@Delete()
@UseGuards(SessionGuard)
async deleteAll(@Query() q: CustomerQueryDto) {
  return this.service.deleteAllForCustomer(q.customerId);
}
```

E no `deleteThread`:
```ts
@Delete('threads/:threadId')
@UseGuards(SessionGuard)
async deleteThread(
  @Param() p: ThreadIdParam,
  @Query('customerId') customerId: string,
  @Session() _s: SessionData,  // Session lida mas nao usada!
) {
  return this.service.deleteThread(p.threadId, customerId);
}
```

**Bug**: `customerId` vem do query param, não da session. Customer B em qualquer mesa pode chamar `DELETE /:slug/chat-history?customerId=<UUID-do-customer-A>` e apagar TODO o histórico de A.

A `service.deleteAllForCustomer` em `chat-history.service.ts:213-237` faz `deleteMany({ customerId })` direto, sem cross-checar com session.

**Repro hipotético**:
1. Customer A tem 60 threads em `/luna`. 
2. Customer B (atacante) abre `/luna`, escaneia QR (ganha session).
3. B precisa do `customerId` de A — vaza via outro endpoint (e.g. `GET /:slug/orders` retorna `customer_id` em items, ou via `chat-history/threads?customerId=<bruteforce-uuid>`).
4. B faz `DELETE /luna/chat-history?customerId=<A-uuid>` → A perde 60 threads + protocolo LGPD do B fica como provador da action de A. Auditoria comprometida.

**Fix sugerido**: derivar `customerId` da session/cookie `recognition_token` do caller. Rejeitar se `query.customerId !== session.customerId`.

---

## B-NEW-10 · Mongo init script inicializa DB errado (P0)

**Severidade**: **P0** (todas as queries de chat-history em prod sem indexes; TTL não aplica → docs vivem pra sempre, viola LGPD).

**Source**: `packages/database/mongo-init.js:14`.

```js
db = db.getSiblingDB('chat_history');   // DB errado
db.chat_threads.createIndex(...);
db.chat_messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**Conflito**:
- API conecta em `process.env.MONGODB_DB` ou `'restaurant_chat'` (default) — ver `apps/api/src/infra/mongo/mongo.service.ts:36-37`.
- `docker-compose.yml:74` injeta `MONGODB_DB: restaurant_chat`.
- `packages/database/mongo-init.js:14` inicializa `chat_history`.

**Resultado**: 
- Em fresh boot (`docker-compose up -d` com volume novo), o init script roda mas em DB errado. API escreve em `restaurant_chat.*` que NUNCA tem indexes/TTL aplicados.
- `chat_messages` cresce sem TTL → eventualmente DB inflado, GDPR/LGPD violation (custos LGPD: 30d retention obrigatório).
- `find({ customerId, restaurantId })` faz collscan em todo o `chat_messages`. Performance degrada com volume.

**Cross-check**: `packages/database/scripts/mongo-init.ts:15` (variant TS rodada via `npm run mongo:init`) usa `MONGODB_DB || 'restaurant_chat'` — está correto. **Só o JS está errado**.

**Repro**: 
1. `docker-compose down -v && docker-compose up -d`
2. Connect mongosh: `db.chat_history.chat_messages.getIndexes()` → vê TTL.
3. `db.restaurant_chat.chat_messages.getIndexes()` → só `_id_` (TTL ausente).
4. POST `/:slug/assistant/message` → escreve em `restaurant_chat.chat_messages` (sem TTL).
5. Aguarda 90 dias (ou ajusta `expiresAt` num doc): **doc não é deletado** porque TTL não existe.

**Fix sugerido**: trocar `db.getSiblingDB('chat_history')` por `db.getSiblingDB('restaurant_chat')` em `mongo-init.js:14` e atualizar `print()` em :29. Fields também estão inconsistentes entre `mongo-init.js` (camelCase: `customerId`) e `mongo-init.ts` (mistura: `tenant_id` snake_case + `customerId` camelCase) — mas o serviço Node grava em camelCase, então alinhar `mongo-init.ts` pra camelCase puro.

---

## B-NEW-11 · /customer/identify unauth + retorna recognitionToken (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/customers/customers.controller.ts:77-96` + `customers.service.ts:170-197`.

```ts
@Post('identify')
async identify(@Body() dto: CustomerIdentifyDto, @Res() res) {
  const result = await this.customersService.identify(dto.cpf, dto.name, dto.currentSessionId);
  res.cookie('recognition_token', result.recognitionToken, { httpOnly: true, ... });
  return result;
}
```

Service retorna `{ customerId, isReturning: true, canonicalName, customer: { name, totalVisits }, recognitionToken }` quando CPF bate.

**Bug**:
1. **Sem auth nenhuma** (comentário diz "bootstrap pra late-arrival" mas é qualquer um na internet com slug do restaurante).
2. **Sem rate-limiting** — `staff verifyPin` tem throttle Redis (5/5min, conforme `staff.controller.ts:41`), mas `customer/identify` não.
3. Retorna `recognitionToken` (HttpOnly cookie) — CSRF não protege porque o atacante recebe o token NO BODY da resposta (linha 95 retorna `result` que inclui `recognitionToken`). Cookie + body explícito.
4. Combinado: atacante bate CPFs em loop, descobre quais existem, GANHA recognitionToken pra cada → entra em qualquer restaurante daquele tenant como qualquer cliente recorrente.

**Repro hipotético**:
- Atacante itera 10^11 CPFs (ou subset com regex válido). Sem rate-limit, ~1k/s = ~3 anos pra cobrir tudo, mas em prática usa CPFs de leaks públicos (R$5/milhão).
- Cada CPF válido = 1 recognitionToken = `recognize` endpoint subsequente abre conta com nome do cliente real.

**Fix sugerido**:
1. Mudar service.identify pra NÃO retornar `recognitionToken` no body (só setar cookie HttpOnly) — chamadores legítimos usam cookie auto-anexado.
2. Adicionar throttle por IP (5 tentativas/15min) usando `@nestjs/throttler` ou Redis.
3. Considerar mover identify pra endpoint que exige `tableSessionId` válido + scan recente — late-arrival flow já passa por mesa do host conhecida, não precisa ser totalmente público.

---

## B-NEW-12 · late-arrival approve/reject sem ownership host (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/late-arrival/late-arrival.controller.ts:121-151` + `late-arrival.service.ts:99-114`.

```ts
@Post(':id/approve')
@UseGuards(SessionGuard)
async approve(@Param('id') id, @Body() dto: ApproveDto = {}) {
  return this.service.approve(id, { staffId: dto.staffId, customerId: dto.customerId }, slug);
}
```

DTO permite `staffId?: string` e `customerId?: string` arbitrários. Service `respond()` em `late-arrival.service.ts:116-209` não valida que:
- `dto.customerId` === customer logado na session.
- `dto.staffId` veio de uma request com `x-staff-key` (não veio — só SessionGuard).
- O caller é o HOST atual da mesa/sessão referida no `late_arrival_requests.table_session_id`.

**Repro hipotético**:
1. Customer A escaneia QR mesa 5 (vira host).
2. Customer B chega tarde, faz POST `/late-arrival-requests` com `customerId: B`. Pending.
3. Customer C (hostil), em outra mesa do MESMO restaurante, com session valida, faz `POST /:slug/late-arrival-requests/<id>/reject` com `customerId: <UUID-do-A>`. Service registra `approved_by_customer_id = A`. B rejeitado, A culpado no audit log.

OU pior: B aceita-se a si mesmo passando seu próprio customerId no approve (já que não há check de "host vs requester").

**Fix sugerido**: 
1. Buscar `late_arrival_requests.table_session_id` → fetch `session_participants` → identificar host customer_id.
2. Validar `session.customer_id === host_customer_id` (host approval path) ou exigir `x-staff-key` (staff fallback path).
3. Não confiar em `dto.customerId`/`dto.staffId` pra identidade — use só pra metadata.

---

## B-NEW-13 · order_deliveries claim race (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/deliveries/deliveries.service.ts:12-58` + schema `packages/database/migrations/tenant-template/009_create_deliveries.sql`.

```ts
async claimOrder(orderId, slug) {
  // SELECT order...
  // SELECT existingClaim...
  if (existingClaim.length > 0) throw 'ja foi reivindicado';
  // INSERT order_deliveries (order_id, status='claimed')
}
```

`009_create_deliveries.sql:1-9`:
```sql
CREATE TABLE order_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  ...
);
-- Sem UNIQUE em order_id, sem partial index UNIQUE(order_id) WHERE status != 'cancelled'
```

**Bug**: TOCTOU clássico — 2 garçons clicam "Aceitar entrega" simultaneamente. Ambas SELECTs retornam existingClaim vazio, ambas INSERT criam claims. Garçom A acha que vai entregar; B também. Pedido sai por A, B ainda tenta entregar e fica confuso. Ou pior, ambos marcam delivered, status history corrompido (2x INSERT).

**Repro hipotético**: Provoke via `Promise.all([fetch.../claim, fetch.../claim])` em 2 sims diferentes ou 2 abas. Atomicidade não existe.

**Fix sugerido** (combo):
1. **Schema**: `CREATE UNIQUE INDEX deliveries_active_claim_unique ON order_deliveries(order_id) WHERE status != 'cancelled';` — Postgres rejeita o segundo INSERT.
2. **Code**: substituir SELECT+INSERT por single INSERT com tratamento de unique violation (catch error code 23505 → throw "ja reivindicado").

OU usar UPDATE atômico:
```sql
INSERT INTO order_deliveries (order_id, ...) 
SELECT $1, ... 
WHERE NOT EXISTS (SELECT 1 FROM order_deliveries WHERE order_id = $1 AND status != 'cancelled')
RETURNING id;
-- if no rows returned → race detected, throw conflict
```

---

## B-NEW-14 · waiter_calls.acknowledge race (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/waiter-calls/waiter-calls.service.ts:194-235`.

```ts
async acknowledgeCall(callId, ...) {
  const rows = await this.tenantConn.query(`SELECT id, status FROM waiter_calls WHERE id = $1`, [callId]);
  if (rows[0].status !== 'pending') throw 'Chamado ja foi atendido.';
  await this.tenantConn.query(
    `UPDATE waiter_calls SET status='acknowledged', acknowledged_at=now(), assigned_waiter_name=COALESCE(...) WHERE id = $1`,
    [callId, ...],
  );
}
```

**Bug**: SELECT então UPDATE — 2 garçons chamam `acknowledge` no mesmo callId simultaneamente, ambos passam status check, ambos UPDATE. O segundo sobrescreve `assigned_waiter_name` do primeiro (mesmo padrão de B-NEW-1 do round 3 em complaints). UI mostra garçom B atendendo, mas o evento WS `emitWaiterCallAcknowledged` foi disparado 2x.

Compare com `resolveCall` (mesmo arquivo, linha 237-243) que JÁ FAZ certo: `UPDATE ... WHERE id=$1 AND status IN (...)` — atômico, sem read-then-write.

**Fix sugerido**: 
```sql
UPDATE waiter_calls
SET status='acknowledged', acknowledged_at=now(), 
    assigned_waiter_name=COALESCE($2, assigned_waiter_name),
    eta_minutes=COALESCE($3, eta_minutes)
WHERE id = $1 AND status = 'pending'
RETURNING id, table_session_id;
-- if 0 rows: throw 'Chamado ja foi atendido.'
```

**Pré-existência**: similar em natureza ao B-NEW-1 do round 3 (complaints), mas em endpoint diferente. Mesmo padrão errado replicado.

---

## B-NEW-15 · Chat history TTL diverge da spec LGPD (P2)

**Severidade**: **P2** (compliance).

**Source**: `apps/api/src/modules/chat-history/chat-history.service.ts:17`.

```ts
const DEFAULT_TTL_DAYS = 90;
```

**Conflito**:
- `docs/features/chat-history-lgpd.md:4`: "Backend: a implementar com NoSQL · auto-deletion **30 dias**."
- `:38`: "ficam só **30 dias**"
- `:228`: comment SQL `// startedAt + 30 dias`
- `:290`: `retentionDays: 30` retornado pra frontend
- `:299`: copy "30 dias atrás até hoje"
- `:314`: copy customer-facing "ficam por 30 dias antes de sumir"

UI promete 30 dias, código guarda 90 dias. Customer que pediu LGPD erasure achando ter 30d de retenção fica com 60d a mais de dado armazenado (LGPD princípio da minimização Art. 6 III — coleta excessiva).

Ou se estiver comunicando "30 dias" em política mas guardando 90, em uma fiscalização ANPD pode ser caracterizado como divergência de transparência (Art. 9).

**Fix sugerido**: 
1. Decisão de produto: `30` ou `90`? Spec diz 30; alinhar para `30`.
2. Mudar `DEFAULT_TTL_DAYS = 30` em `chat-history.service.ts:17`.
3. Backfill: rodar script que atualiza `expiresAt = startedAt + 30d` em docs já criados (ou aceitar perda de 60d em rows existentes).

---

## B-NEW-16 · chat-history listMessages sem ownership check (P2)

**Severidade**: **P2** (IDOR PII).

**Source**: `apps/api/src/modules/chat-history/chat-history.controller.ts:43-47`.

```ts
@Get('threads/:threadId/messages')
@UseGuards(SessionGuard)
async listMessages(@Param() p: ThreadIdParam) {
  return this.service.listMessages(p.threadId);
}
```

**Bug**: Service `listMessages(threadId)` em `chat-history.service.ts:164-180` faz `find({ threadId })` direto, sem cross-check com customer da session.

threadId é determinístico: `${tenantId}:${customerId}:${YYYY-MM-DD}` (ver `chat-history.service.ts:87`).

Customer A com session válida em `/luna` pode:
- Conhecer `customerId` de B (ex.: vaza em `participants` API, ou bruteforce UUID).
- Conhecer `tenantId` (= seu próprio).
- Calcular threadIds de B para qualquer dia → ler conversas inteiras (incluindo mensagens da IA com nome real, CPF, queixas, etc).

**Fix sugerido**: 
1. Service: aceitar `customerId` do caller, validar que `thread.customerId === customerId`.
2. Controller: extrair customerId da session (não do query) e passar pra service.

---

## B-NEW-17 · GET /feedbacks por visitId sem ownership (P2)

**Severidade**: **P2** (IDOR mild).

**Source**: `apps/api/src/modules/feedbacks/feedbacks.controller.ts:92-96`.

```ts
@Get()
@UseGuards(SessionGuard)
async getFeedback(@Query('visitId') visitId: string) {
  return this.feedbacksService.getFeedbackByVisit(visitId);
}
```

Não há validação de que `visitId` pertence ao session.sessionId ou customer logado. Customer A em qualquer mesa lê feedback de qualquer visitId em qualquer mesa do MESMO tenant (ou de qualquer tenant se vazasse via outro endpoint, mas tenant isolation por schema cuida disso).

Conteúdo: rating + comment + tags. Não é PII pesado mas é subjetivo + comments podem mencionar nomes/telefones.

**Fix sugerido**: filtrar por `WHERE visit_id = $1 AND customer_id = $session.customerId` ou JOIN com `session_participants` pra confirmar ownership.

---

## B-NEW-18 · table_sessions.session_token coluna morta (P3)

**Severidade**: **P3** (code smell).

**Source**: `apps/api/src/modules/table-session/table-session.service.ts:120-128`.

```ts
const sessionToken = uuidv4();
const result = await this.tenantConn.query(
  `INSERT INTO table_sessions (table_id, session_token, status) VALUES ($1, $2, 'active') RETURNING id`,
  [table.id, sessionToken],
);
sessionId = result[0].id;   // ← table_sessions.id usado como token
```

**Observação**: `session_token` UUID é gerado e persistido, mas o "token" que vai pro Redis (`session:${sessionId}`), pro cookie, e pro header `x-session-token` é `result[0].id` (o PK da tabela, outro UUID).

Não é exploit (ambos UUIDs têm 122 bits de entropia), mas é confuso:
- Lendo o code review entende-se que `session_token` é o token; na prática nunca é lido.
- Se um dia alguém adicionar `findBySessionToken(token)` lookup, vai bater no field errado.

**Fix sugerido**: ou (a) remover `session_token` da migration + INSERT, ou (b) trocar Redis key + cookie value pra usar `session_token` ao invés de `id`. Opção (a) é menor diff.

---

## Outras observações (não-achados, validação)

### Pix QR leak (Task 3) — sem regressão pós PR #26

`apps/api/src/modules/payments/payments.service.ts:122-126` cria `pixCode` apenas quando `method === 'pix'`. INSERT (`:129-147`) passa `null` quando não-pix, e os returns (`:162-173`, `:322-335`, `:361-373`) refletem isso.

`getSessionPayments` (:338-374) NÃO inclui `pix_qr_code` na SELECT — list view safe.

**Pequena melhoria sugerida (P3, defense-in-depth)**: em `getPaymentStatus` (:280) adicionar `CASE WHEN method = 'pix' THEN pix_qr_code ELSE NULL END as pix_qr_code` — protege contra rows legacy criadas antes do fix do PR #26 que possam ainda ter `pix_qr_code` populado em pagamentos não-pix.

### SQL injection (Task 5) — sem achados

Todas as ocorrências de `query(\`...\${var}\`)` são pra `SET search_path = '${schemaName}'` (Postgres não aceita `$1` em search_path). `schemaName` é validado por regex `/^[a-z_][a-z0-9_]{0,62}$/` em `tenant.middleware.ts:49` E novamente em `ttl-tick.service.ts:80` (defense-in-depth). 

`setClause.join(', ')` em `host.service.ts`, `promotions.service.ts`, `staff.service.ts` usa só strings hardcoded (server-controlled), parametros sempre via `$N`. Safe.

### JWT/sessão (Task 6) — sem JWT, sem secrets hardcoded

API não usa JWT. Sessions são tokens UUID em Redis (TTL 4h, refresh em scan). Staff auth via `STAFF_API_KEY` env (timingSafeEqual em `staff-only.guard.ts`). HMAC do QR usa `qr_hmac_secret` per-tabela do banco.

Sem secrets em code. Tudo OK aqui (modulo B-NEW-18 estética).

---

## Audit /dividir/payment customer routes (Task 1)

| File | Propósito | Sheet candidate? |
|---|---|---|
| `apps/web-customer/src/app/[slug]/pagamento/page.tsx` (302 linhas) | Lista da conta com toggle table/individual + escolha de método (pix/credit/debit). Botão "Dividir conta" navega pra /dividir | **NÃO** — rota principal, é fullscreen legítima. |
| `apps/web-customer/src/app/[slug]/pagamento/dividir/page.tsx` (313 linhas) | Tabs "Igual / Por item / Customizado" + lista por participante + dois CTAs (enviar resumo / pagar parte). | **TALVEZ** — fluxo é 1-tap dentro de `/pagamento`, conteúdo todo cabe em sheet 80vh. Conversão diminui empilhamento de rotas. Reusa BottomSheet (já existe em `components/ui/BottomSheet.tsx`). |
| `apps/web-customer/src/app/[slug]/pagamento/feedback/page.tsx` (158 linhas) | Pós-pagamento: rating + tags + comentário. | **SIM** — claramente um momento de "fim de fluxo", sheet faz sentido pra não tirar o customer da mesa view. Equivalente UX ao `/garcom/chamar` que virou C16-sheet. |
| `apps/web-customer/src/app/[slug]/pagamento/erro/page.tsx` (143 linhas) | Erro de pagamento + alternativas. | **SIM** — modal de erro, não merece rota. Equivalente UX a confirm dialog "tentar de novo / outras formas". |
| `apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx` (229 linhas) | QR Code + countdown + copia-cola + cancel. | **NÃO** — paga atenção contínua, rota fullscreen é certo (fullscreen no celular = QR ocupa hero). Sheet aqui ia esconder o QR ao scroll. |

**Sumário Task 1**: 2 candidatos fortes a sheet (`/feedback`, `/erro`), 1 fraco (`/dividir`), 2 manter (`/pagamento`, `/pix`).

---

## Recomendação de priorização

**Bloqueadores P0** (precisam ir no próximo PR):
1. **B-NEW-8** · promotions guard — 5min fix (trocar import + 3 decorators).
2. **B-NEW-9** · chat-history DELETE ownership — 15min fix (passar `session.customerId` adiante).
3. **B-NEW-10** · mongo-init.js DB name — 1min fix (1 linha) + verificar se em prod já existe DB errado pra migrar.

**P1 antes de release**:
4. **B-NEW-11** · /customer/identify hardening (rate-limit + remover token do body) — ~2h.
5. **B-NEW-12** · late-arrival ownership check — ~1h.
6. **B-NEW-13** · order_deliveries unique constraint — 1 migration.
7. **B-NEW-14** · waiter_calls atomic ack — 5min fix.

**P2/P3 backlog**:
8. **B-NEW-15** · TTL 90→30 + decisão produto.
9. **B-NEW-16, B-NEW-17** · IDOR ownership checks (mesma família, fazer junto).
10. **B-NEW-18** · cleanup `session_token` coluna morta.

---

## Comparação com Round 3

Round 3 achou:
- B-NEW-1 (P1 race em complaints) → **AINDA EXISTE** em `complaints.service.ts:120-130`. PR #26 não cobriu.
- B-NEW-2/4/7 (limpeza/órfãos) — não revalidados aqui.
- B-NEW-3 (WS staff_message.read) — não revalidado.
- B-NEW-5 (CPF cross-tenant) — não revalidado, mas relacionado ao B-NEW-11 (CPF unauth lookup).
- B-NEW-6 (URLs ai-service) — resolved.

Round 4 não duplica esses achados; B-NEW-14 é novo mas mesmo PADRÃO de bug que B-NEW-1.
