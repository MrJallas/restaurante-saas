# Round 5 · Bug-hunt audit (Frente B)

> Run: 2026-05-09 · paralelo aos fixes do PR Round 5 (B-NEW-8..18 do round 4).
> Target: descobrir bugs NOVOS pós PR round 5. Foco em guards permissivos
> que sobreviveram, IDOR de DTOs (mass-assignment de IDs), bypass de role,
> migrations destrutivas, exposição de serviços. Sem rodar — só audit
> estático.

## TL;DR

14 achados novos · severidades misturadas, **6 P0 + 4 P1** críticos.

- **B-NEW-19 (P0)**: `POST/PATCH/DELETE /:slug/staff/*` ainda usa `StaffOrSessionGuard` — qualquer customer com session ativa cria, edita PIN/role, ou DELETA staff inteiro. **Mesma família do B-NEW-8 (promotions) que foi fixado, mas em staff/dashboard/deliveries ficou.**
- **B-NEW-20 (P0)**: `DashboardController` inteiro com `StaffOrSessionGuard` — customer lê revenue/AI usage/top items/feedback summary do tenant inteiro. Confidencialidade financeira violada.
- **B-NEW-21 (P0)**: `DeliveriesController` com `@UseGuards(StaffOrSessionGuard)` no controller-level — customer claima/marca delivered/lista entregas pendentes. Pedido de outro cliente "entregue" pra impedir delivery legítima.
- **B-NEW-22 (P0)**: `ManagerOnlyGuard` confia em header `x-staff-role` client-controlled. Qualquer staff (waiter / cook) com `x-staff-key` envia `x-staff-role: manager` e bypassa restrição. Zone-pause, VIP flags, complaint respond ficam abertos. **Toda a hierarquia de roles colapsa.**
- **B-NEW-23 (P0)**: `POST /:slug/lgpd-requests` aceita `customerId` no body sem cross-check com session — customer A em mesa 5 dispara `kind:'erasure', customerId:<vítima>` e o serviço EXECUTA o erasure imediatamente (deletando chat history da vítima). Mass-destruction LGPD via session token. Variação do B-NEW-9 (chat-history) que foi fixado, mas o LGPD service não foi.
- **B-NEW-24 (P0)**: `PATCH /:slug/orders/:orderId/status` aceita session no `StaffOrSessionGuard` mas a service `updateStatus` NÃO valida ownership de `table_session_id`. Customer com session em qualquer mesa cancela / marca `delivered` qualquer order do tenant inteiro. KDS state machine corrompida. Comparar com `cancelOrder` que JÁ FAZ a validação correta.
- **B-NEW-25 (P1)**: `ai-service` (FastAPI porta 8000) sem autenticação alguma + `0.0.0.0:8000` exposto no docker-compose. Internet bate em `/chat`, `/tools/dispatch`, `/classify` direto. DoS gratuito + custo LLM ilimitado.
- **B-NEW-26 (P1)**: WS `handleJoinTenant` aceita `slug` do client sem verificar que o staff client pertence àquele tenant. STAFF_API_KEY é shared global (não per-tenant) — staff do tenant A entra em room `tenant:tenant-B` e escuta order/complaint/payment events do B. Cross-tenant operational leak.
- **B-NEW-27 (P1)**: DTOs de mutação aceitam IDs de identidade arbitrários (`customerId`, `staffId`, `decidedByCustomerId`, `senderStaffId`) sem cross-check com session. Combo afeta: `POST /complaints`, `POST /order-ratings`, `POST /late-arrival-requests` (create), `POST /table-merge-requests/:id/approve`, `POST /staff-messages`. Customer A imprime ações em audit log como se fosse customer B.
- **B-NEW-28 (P1)**: `recognitionToken` retornado no body de `POST /customer/welcome` (linha 138 controller). HttpOnly cookie é setado, mas o body também tem o token — qualquer XSS na página do customer rouba o token e abre conta dele em qualquer mesa. Análogo ao B-NEW-11 que foi parcialmente fixado.
- **B-NEW-29 (P2)**: Migration 032 (`zone_pauses_refactor`) faz `DROP TABLE IF EXISTS zone_pauses` + recria SEM `IF NOT EXISTS` nos `CREATE INDEX`. Cenário destrutivo: se o `__migrations__` tracker em algum tenant ficar inconsistente (ex.: backfill heuristic em `migrate-tenants.ts:131` mark wrong cutoff), a migration roda **DESTRUINDO TODAS as zone_pauses ativas** no schema. Idempotência só funciona via runner — bypass manual = data loss.
- **B-NEW-30 (P2)**: `staff.verifyPin` throttle é por `staffId` individual. Atacante com lista de staff IDs (vaza no `GET /:slug/staff` que é público) tem 5 attempts × N staff = N×5 tentativas antes de qualquer lockout global. Para um restaurante com 10 staff e PIN 4-digit, espaço efetivo = 50/10000 = 0.5% por round. Cumulativo não é desprezível.
- **B-NEW-31 (P2)**: `GET /:slug/table-merge-requests` SEM guard nenhum (linha 100-106). Público. Qualquer um lista todos os pedidos de junção de mesa do tenant.
- **B-NEW-32 (P3)**: `GET /:slug/staff/sessions/:tableSessionId/flags` (vip.controller.ts:71) sem guard — public listing de flags VIP/allergy/reincidente da sessão. Operacional, não-PII direto, mas vaza padrões de atendimento.

Detalhes abaixo.

---

## B-NEW-19 · Staff CRUD aceita customer session (P0)

**Severidade**: **P0**.

**Source**: `apps/api/src/modules/staff/staff.controller.ts:69-85`.

```ts
@Post()
@UseGuards(StaffOrSessionGuard)   // ← aceita session
async create(@Body() dto: CreateStaffDto) { ... }

@Patch(':id')
@UseGuards(StaffOrSessionGuard)
async update(@Param('id') id: string, @Body() dto: UpdateStaffDto) { ... }

@Delete(':id')
@UseGuards(StaffOrSessionGuard)
async delete(@Param('id') id: string) { ... }
```

Comentário no controller (linhas 35-42):
> "Mutacoes (criar/editar/deletar) exigem `x-staff-key`. Antes era TUDO publico (P0 round 3)."

Falso — `StaffOrSessionGuard` aceita `x-staff-key` OU session token (`apps/api/src/common/guards/staff-or-session.guard.ts:33-65`). Mesma família do B-NEW-8 (promotions) que foi fixado pra `StaffOnlyGuard`, mas staff esqueceu.

**Repro hipotético**:
1. Customer escaneia QR de mesa em `/luna` → ganha session_token.
2. Customer faz `POST /luna/staff {name:'Hacker',role:'manager',pin:'0000'}`.
3. Customer agora tem PIN de manager válido — login no web-staff sem `x-staff-key`?  Bem, manager-PIN flow do staff-app também usa o STAFF_API_KEY (shared), mas o atacante consegue pelo menos:
   - Criar staff fantasma (manager) que vai pra audit logs.
   - PATCH PIN de um manager existente pra valor conhecido → atacante usa o login regular do staff app pra entrar com PIN novo.
   - DELETE todos os staff do restaurante → manager real fica trancado fora.

**Fix sugerido**: trocar `StaffOrSessionGuard` por `StaffOnlyGuard` em `@Post()`, `@Patch(':id')`, `@Delete(':id')`. Considerar adicionar também `ManagerOnlyGuard` pra criação de manager (mas ver B-NEW-22 antes).

---

## B-NEW-20 · Dashboard financeiro aberto pra customer (P0)

**Severidade**: **P0**.

**Source**: `apps/api/src/modules/dashboard/dashboard.controller.ts:12-13`.

```ts
@Controller(':slug/dashboard')
@UseGuards(StaffOrSessionGuard)   // ← controller-level — aceita session
export class DashboardController { ... }
```

Comentário linhas 6-9:
> "Dashboard financeiro/analytics — exclusivo de staff/admin. Antes era publico... Agora todos os endpoints exigem `x-staff-key`."

Mesma mentira do B-NEW-19. `StaffOrSessionGuard` aceita session. Customer com session faz:
- `GET /:slug/dashboard/overview`
- `GET /:slug/dashboard/revenue?days=365` → revenue dia-a-dia do ano inteiro
- `GET /:slug/dashboard/top-items` → ranking BI
- `GET /:slug/dashboard/feedback-summary` → reputação interna
- `GET /:slug/dashboard/ai-usage` → tokens/custo LLM (vaza estratégia de provider)

**Repro hipotético**: `curl 'http://api/luna/dashboard/revenue?days=365' -H 'x-session-token: <token-do-cliente-em-qualquer-mesa>'`. Retorna histórico financeiro completo.

**Fix sugerido**: trocar `StaffOrSessionGuard` por `StaffOnlyGuard` no controller-level. Customer-side não tem use case pra ver dashboard financeiro.

---

## B-NEW-21 · Deliveries module todo aberto pra session (P0)

**Severidade**: **P0**.

**Source**: `apps/api/src/modules/deliveries/deliveries.controller.ts:11`.

```ts
@Controller(':slug/deliveries')
@UseGuards(StaffOrSessionGuard)   // ← controller-level
export class DeliveriesController { ... }
```

Comentário linhas 5-9:
> "Endpoints de entrega — exclusivos de staff (waiter/cozinha). Antes eram TOTALMENTE publicos... P0 do bug-hunt round audit."

Mas `StaffOrSessionGuard` aceita session. Customer com session faz:
- `POST /:slug/deliveries/claim/:orderId` → claima pedido alheio (impedindo o garçom real de pegar).
- `POST /:slug/deliveries/:deliveryId/delivered` → marca como entregue (cliente real fica sem comida).
- `GET /:slug/deliveries/pending` → lista todas entregas pendentes do tenant.

A migration 038 (round 5) adiciona UNIQUE em `order_deliveries(order_id)` então o claim-twice é blocked, mas isso significa que o customer **claima ANTES** do garçom — efetivamente DoS de entregas.

**Repro hipotético**:
1. Customer escaneia QR `/luna`, ganha session.
2. Loop: `for orderId in /:slug/orders` → `POST /:slug/deliveries/claim/:orderId`. Todos os pedidos prontos ficam "claimados" pelo customer.
3. Garçom real abre app, vê 0 pedidos disponíveis. Cozinha trava.

**Fix sugerido**: trocar `StaffOrSessionGuard` por `StaffOnlyGuard` no `@Controller`. Marca-se que GET /pending poderia ficar com session pra que o cliente veja "seu pedido foi pego pelo garçom" mas é mais limpo manter staff-only e expor um endpoint customer-side `/orders/:id/delivery-status` quando precisar.

---

## B-NEW-22 · ManagerOnlyGuard bypass via header client-controlled (P0)

**Severidade**: **P0** (collapse total da role hierarchy).

**Source**: `apps/api/src/common/guards/manager-only.guard.ts:22-31`.

```ts
canActivate(ctx: ExecutionContext): boolean {
  const req = ctx.switchToHttp().getRequest<{ headers: ... }>();
  const role = req.headers['x-staff-role'];
  if (role !== 'manager') {
    throw new ForbiddenException('manager-only endpoint');
  }
  return true;
}
```

**Bug**: Confia em `x-staff-role` header que vem do CLIENT. Não há cross-check com algum role registrado server-side (ex.: `staff` table com `role` column linkada por staffId+pinHash). Qualquer caller com `x-staff-key` setado seta `x-staff-role: manager` e bypassa.

Endpoints afetados (todos compõem `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)`):
- `POST /:slug/zone-pauses` · pausar zona (afeta toda a operação de delivery).
- `POST /:slug/zone-pauses/:id/end` · liberar zona.
- `DELETE /:slug/zone-pauses/:id` · idem.
- `POST /:slug/staff/sessions/:tableSessionId/flags` · flag VIP/allergy/reincidente.
- `POST /:slug/complaints/:id/respond` · responder reclamação (manager only).

**Repro**: garçom com app legítimo já tem `x-staff-key` (compartilhado). Em mod-app ou via curl, manda `x-staff-key: <staff-key> ; x-staff-role: manager`. Ganha acesso a respond de complaints, pausar zona inteira, etc.

**Pior**: STAFF_API_KEY é env shared. Qualquer um que vaze de log/CI/dev .env é manager efetivo no prod.

**Fix sugerido**:
1. **Curto-prazo**: ManagerOnlyGuard deve buscar o staffId no body/header e fazer `SELECT role FROM staff WHERE id=$1` validando com PIN/JWT prévio. O `x-staff-role` header é puro UI hint, não auth.
2. **Médio-prazo**: substituir STAFF_API_KEY shared por JWT per-staff (com role embutida assinada). Round 4 já tem essa direção (`staff verifyPin` retorna pinValid, falta gerar token assinado).

---

## B-NEW-23 · LGPD erasure de outro customer via body (P0)

**Severidade**: **P0** (LGPD violação + destrutivo).

**Source**: `apps/api/src/modules/lgpd/lgpd.controller.ts:64-77` + `lgpd.service.ts:27-91`.

```ts
@Post()
@UseGuards(SessionGuard)   // ← qualquer session
async create(@Param('slug') slug: string, @Body() dto: CreateLgpdDto) {
  return this.service.createRequest({
    kind: dto.kind,
    customerId: dto.customerId ?? null,   // ← body controla
    ...
  }, slug);
}
```

Service em `:59-83`:
```ts
if (input.kind === 'erasure' && input.customerId) {
  const result = await this.chatHistory.deleteAllForCustomer(input.customerId);
  // ... marca lgpd_request fulfilled
}
```

**Bug**: `customerId` vem do DTO sem cross-check com a session. `kind: 'erasure'` é fulfillment SÍNCRONO — service deleta `chat_messages` e marca threads `deletedByUser` em Mongo IMEDIATAMENTE. Customer A apaga histórico de B + insere protocol number forjado em audit log com `customerId=B`.

**Comparar com B-NEW-9** (round 4 fixado): `DELETE /:slug/chat-history` agora deriva customerId do cookie. **`POST /:slug/lgpd-requests` ficou com a brecha aberta** porque a fix focou só no chat-history controller.

**Repro hipotético**:
1. Customer A em mesa 5, com session válida.
2. Conhece customerId de B (vaza via `participants` ou bruteforce uuid).
3. `POST /:slug/lgpd-requests {kind:'erasure', customerId:'<B-uuid>'}`.
4. Service.createRequest → chatHistory.deleteAllForCustomer(B) → todas threads de B no Mongo são marked deletedByUser e mensagens deleteMany.
5. lgpd_requests row criado em PG com `customer_id=B, status='fulfilled'`. Auditoria mostra "B requested erasure" — o que NÃO aconteceu.

**Fix sugerido**: 
1. Controller: derivar `customerId` do cookie `recognition_token` (helper já existe em `customers.service.resolveByRecognitionToken`).
2. Service: rejeitar se `dto.customerId !== caller.customerId` (cookie); aceitar `customerId` ausente (atribui automático).
3. Considerar requerer 2FA-like step (e-mail confirm protocol) pra LGPD erasure — mesmo que customer real, ataque na sessão dele dispararia erasure permanente sem confirm.

---

## B-NEW-24 · PATCH /orders/:id/status sem ownership check no path session (P0)

**Severidade**: **P0**.

**Source**: `apps/api/src/modules/orders/orders.controller.ts:261-274` + `orders.service.ts:675-751`.

Controller:
```ts
@Patch(':orderId/status')
@UseGuards(StaffOrSessionGuard)   // ← aceita session
async updateStatus(
  @Param('orderId') orderId: string,
  @Param('slug') slug: string,
  @Body() dto: UpdateStatusDto,
) {
  return this.ordersService.updateStatus(orderId, dto.status, dto.changedBy || 'system', slug);
}
```

Service em `orders.service.ts:675-751`:
```ts
async updateStatus(orderId, newStatus, changedBy, slug?) {
  const orderRows = await this.tenantConn.query(
    `SELECT id, status, table_session_id FROM orders WHERE id = $1`,   // ← sem WHERE table_session_id
    [orderId],
  );
  // valid transition check, então UPDATE.
  await this.tenantConn.query(
    `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`,  // ← sem session check
    [newStatus, orderId],
  );
  // ...
}
```

**Bug**: Quando o caller é session (não staff), o service NÃO valida que `table_session_id` da order pertence à session do caller. Customer A em mesa 5 cancela qualquer order do tenant inteiro.

Mas **espera** — round 4 fixou isso no `cancelOrder` (`orders.service.ts:370-376`):
```ts
SELECT id, status, table_session_id FROM orders
 WHERE id = $1 AND table_session_id = $2
```

`updateStatus` NÃO foi atualizado. **Mesma família, mesmo padrão errado.**

**Repro hipotético**:
1. Customer A escaneia QR `/luna`, vira session.
2. `GET /:slug/dashboard/overview` (B-NEW-20 acima) → vê orderIds.
3. `PATCH /:slug/orders/<order-de-B>/status {status:'cancelled'}` → pedido de B cancelado.
4. Repete pra todo orderId visível → restaurante inteiro sem pedidos ativos.

OU pior: marcar `delivered` em pedido `ready` que não foi entregue → cliente real fica sem comida + sem prova no audit.

**Fix sugerido**: 
- **Path session**: validar `table_session_id` igual ao session.sessionId. Customer pode SÓ avançar pra `cancelled` (nunca delivered/ready/etc).
- **Path staff**: livre como hoje (kitchen/garcom precisam mover status).
- Branch no service via parâmetro `actorType: 'staff' | 'session'`. Refletir no `changedBy` audit.

---

## B-NEW-25 · ai-service sem auth + porta 8000 exposta (P1)

**Severidade**: **P1** (DoS direto + custo LLM ilimitado).

**Source**: 
- `services/ai-service/main.py:202-550` · todos endpoints sem auth.
- `docker-compose.yml` (ai-service block):
  ```yaml
  ai-service:
    ...
    ports:
      - "8000:8000"
    command: ... uvicorn main:app --host 0.0.0.0 --port 8000 --reload
  ```

**Bug**:
1. FastAPI em `0.0.0.0:8000` com docker mapeando pra host. Em prod com firewall mal configurado, internet bate direto.
2. Endpoints `/chat`, `/classify`, `/tools/dispatch`, `/continuation`, `/smart-suggestions` não checam Authorization, API key, nada.
3. `/tools/dispatch` permite invocar tools registradas no AI service por nome — algumas leem do DB do tenant (ex.: `ask_about_restaurant`, `recommend_dish`).

**Repro hipotético** (assumindo IP exposto):
- `curl http://<ip>:8000/chat -d '{"message":"...", "tenant_id":"luna"}'` × milhões = OPENAI/Anthropic bill enorme + LM Studio saturado bloqueando o app legítimo.
- `curl /tools/dispatch -d '{"tool":"ask_about_restaurant","args":{"tenant_id":"luna"}}'` → pega dados do menu/restaurant info de qualquer tenant (sabendo o slug).

**Defesa parcial**: o `apps/api` chama o ai-service via Docker network nome (`http://ai-service:8000`), nunca via IP público. Mas a porta exposta no compose é puro acidente — em VPS sem firewall, atacante hits direto.

**Fix sugerido**:
1. **docker-compose.yml**: remover `ports: - "8000:8000"` (apenas comunicação interna via Docker network).
2. **main.py**: adicionar middleware FastAPI checando `Authorization: Bearer <AI_SERVICE_API_KEY>` (env var compartilhada com `apps/api`). Mesmo padrão de STAFF_API_KEY — token-based authentication entre serviços trusted.
3. Rate limit no `apps/api → ai-service` lado para evitar customer DoS (já tem 50/4h por session em assistant.service, mas customer pode crir N sessions).

---

## B-NEW-26 · WS join:tenant aceita slug arbitrário (P1)

**Severidade**: **P1** (cross-tenant leak para staff multi-tenant).

**Source**: `apps/api/src/modules/websocket/events.gateway.ts:131-146`.

```ts
@SubscribeMessage('join:tenant')
handleJoinTenant(
  @ConnectedSocket() client: AuthedSocket,
  @MessageBody() data: { slug: string; role: string },
) {
  if (client.data.authType !== 'staff') {
    client.emit('error', { message: 'Staff auth required for tenant rooms' });
    return;
  }

  const room = `tenant:${data.slug}:${data.role}`;
  client.join(room);
  client.join(`tenant:${data.slug}`);
  client.data.tenantSlug = data.slug;
}
```

**Bug**: `data.slug` vem do client. Não há cross-check com `restaurants` table nem com qualquer staffId-tenant binding. Como `STAFF_API_KEY` é env GLOBAL (não per-tenant), qualquer staff cliente pode entrar em room de qualquer tenant.

**Repro**:
1. Staff client de tenant A loga (handshake com `x-staff-key`).
2. Manda `socket.emit('join:tenant', { slug: 'tenant-B', role: 'manager' })`.
3. Server: `client.join('tenant:tenant-B')` + `client.join('tenant:tenant-B:manager')`.
4. Cliente passa a receber TODOS os eventos broadcast de B: `complaint.received`, `late_arrival.created`, `escalation.created`, `host.swap_requested`, etc — payload com `customerId`, comentários, valores. Operacional + alguns PII vão por canal.

**Compare com B-NEW-3 (round 3)**: era global emit (`server.emit` sem room) — ainda existe em `emitStaffMessageRead` (`events.gateway.ts:661`). Esta nova é diferente: rooms são corretos, mas o `join` aceita slug livre.

**Fix sugerido**: 
1. No handshake handleConnection, derivar tenantSlug do staff client via DB lookup (ex.: `staff_tenant_membership(staffId, slug)` table) ou exigir `x-tenant-slug` header validado contra membership.
2. `handleJoinTenant` rejeita se `data.slug` não é o tenantSlug autorizado do client.
3. Curto prazo (sem schema novo): adicionar env var `MULTI_TENANT_STAFF=false` que, quando true, exige passar slug+staffId+role cross-check.

---

## B-NEW-27 · DTOs aceitam customerId/staffId arbitrário (P1)

**Severidade**: **P1** (audit-log impersonation).

**Sources**: Vários controllers aceitam IDs de identidade no body sem verificar contra a session/staff caller.

| Controller | Endpoint | Body field | File |
|---|---|---|---|
| Complaints | `POST /:slug/complaints` | `customerId`, `visitId`, `orderId` | `complaints.controller.ts:25-65` |
| Order Ratings | `POST /:slug/order-ratings` | `customerId` | `order-ratings.controller.ts:21-41` |
| Late Arrival | `POST /:slug/late-arrival-requests` | `customerId`, `tableSessionId` | `late-arrival.controller.ts:28-48` |
| Table Merge | `POST /:slug/table-merge-requests/:id/approve` | `decidedByCustomerId` | `table-merge.controller.ts:80-98` |
| Staff Messages | `POST /:slug/staff-messages` | `senderStaffId`, `recipientStaffId` | `staff-messages.controller.ts:20-44` |
| Waiter Calls | `POST /:slug/waiter-calls` | `customerId`, `visitId` | `waiter-calls.controller.ts:25-37` |

**Bug comum**: cada um deles escreve `customerId` no DB sem validar `=== session.customerId` ou `staffId === claimsFromHeader.staffId`.

Round 4 fixou apenas:
- `POST /late-arrival-requests/:id/approve|reject` (B-NEW-12) — agora deriva customerId do cookie.
- `DELETE /chat-history` (B-NEW-9) — idem.
- `GET /chat-history/threads/:threadId/messages` (B-NEW-16) — ownership check.

Restantes ficaram. `POST /late-arrival-requests` (CREATE) ainda aceita customerId e tableSessionId arbitrários — atacante cria pedido fake atribuído a outro cliente em outra mesa.

**Repro hipotético** (Complaints):
1. Customer A em mesa 5 (session válida).
2. `POST /:slug/complaints {customerId:'<vítima>', text:'Comida estragada', rating:1}`.
3. Sistema cria complaint atribuído a vítima. Manager vê complaint com nome dela. Audit log mostra vítima reclamando — falsamente. Reputação dela impactada se manager bloqueia/marca como reincidente.

**Repro hipotético** (Table merge approve, mais sério):
1. `POST /:slug/table-merge-requests {sourceTableSessionId:X, targetTableSessionId:Y, requestingCustomerId:'<self>'}` cria pending.
2. Service `approve()` em table-merge.service.ts:175 valida que `decidedByCustomerId` casa com `host_customer_id` da source ou target. Mas **customer A em outra mesa** pode chamar approve com `decidedByCustomerId: <host-de-Y-real>` — a service só vê que o UUID casa com `tgt_host`, não que o caller realmente é tgt_host.

**Fix sugerido** (padrão): em todos esses controllers, ler `recognition_token` cookie + `customers.resolveByRecognitionToken` pra obter caller.customerId; rejeitar se `dto.customerId !== caller.customerId`. Mesmo pattern aplicado em `chat-history.controller.ts:51-69` (B-NEW-16 fix). DTOs perdem o field e o service passa a receber só do caller resolvido.

Para staff body fields (`senderStaffId`, `recipientStaffId`): exigir `x-staff-id` header validado por PIN-derived JWT (ver B-NEW-22 fix).

---

## B-NEW-28 · recognitionToken vaza no body de /customer/welcome (P1)

**Severidade**: **P1**.

**Source**: `apps/api/src/modules/customers/customers.controller.ts:135-145`.

```ts
return {
  customerId: result.customerId,
  name: result.name,
  recognitionToken: result.recognitionToken,   // ← no body
  isReturning: result.isReturning,
  ...
};
```

E também retorna em `/customer/identify` (já notado em B-NEW-11) e `/customer/recognize` (linha 173, retorna `result` que inclui `recognitionToken`).

**Bug**: HttpOnly cookie é setado, mas o body também tem o token. Significa que JS do customer-side App consegue ler `result.recognitionToken` via `await fetch().then(r => r.json())`. Em caso de XSS no `apps/web-customer`, atacante extrai o token e usa pra entrar como customer reconhecido em qualquer mesa do tenant (e via `recognize`, mantém histórico de visitas + flags VIP cumulativos).

`B-NEW-11` cobriu o `identify` (rate-limit + remover token do body). Round 5 não removeu nas outras 2 chamadas equivalentes.

**Fix sugerido**: 
1. `welcome` e `recognize` devem retornar APENAS dados não-sensíveis (`customerId`, `name`, `isReturning`, `totalVisits`, ...) — token só via cookie httpOnly.
2. FE não precisa do token no body porque o cookie auto-anexa em requests subsequentes.
3. Aplicar audit posterior: `git grep "recognitionToken:" apps/api/src/modules/` pra confirmar que nenhum return body novo expoẽ.

---

## B-NEW-29 · Migration 032 destrutiva sem idempotência completa (P2)

**Severidade**: **P2** (data loss potencial em re-run).

**Source**: `packages/database/migrations/tenant-template/032_zone_pauses_refactor.sql`.

```sql
DROP INDEX IF EXISTS idx_zone_pauses_zone_id;
... (mais drops)
DROP TABLE IF EXISTS zone_pauses;
DROP TYPE IF EXISTS zone_pause_kind;

CREATE TABLE zone_pauses ( ... );    -- ← sem IF NOT EXISTS

CREATE INDEX idx_zone_pauses_active_waiter ...;   -- ← sem IF NOT EXISTS
CREATE INDEX idx_zone_pauses_waiter ...;
CREATE INDEX idx_zone_pauses_pending_auto_end ...;
```

**Bug** (compound):
1. **Não idempotente**: re-run com `__migrations__` ausente faz `DROP TABLE zone_pauses` (existing dados de zone_pauses ATIVAS — pausas de garçom em vigor — se perdem) + recria. Indexes se duplicam (ERRO 42P07 "relation already exists").
2. **migrate-tenants.ts:131** tem heuristic backfill: se schema tem `customers + escalation_chains + reservations`, marca 001-035 como done. Se 035 (`reservations`) existir mas 032 NÃO foi aplicada (schema feito por sync alternativo), o probe vai marcar 032 como done erroneamente. Re-runs futuros ainda pulam — mas se algum dia o tracker for resetado/perder rows, 032 roda de novo destruindo dados.

Em produção real: ops recriam containers, perdem volume `__migrations__` table → runner roda 032 do início → DROP TABLE em prod com pausas ativas.

**Repro**:
- Postgres: tenant `restaurant_dev` com migrations 001-038 aplicadas + zone_pauses tem 3 rows ativas.
- `TRUNCATE __migrations__` (acidente humano).
- API restart com `RUN_TENANT_MIGRATIONS=1` → migrate-tenants.ts roda. Probe vê customers + escalation_chains + reservations → marca 001-035 done. Aplica 036+. 
- **Mas se probe perder reservations** (tenant antigo onde 035 não rolou): probe marca apenas 001-023, então 024-038 rodam. Migration 032 dropa zone_pauses. **Dados de pausas ativas: perdidos**.
- Idem se admin der drop manual em `__migrations__` com tenant em branco mais antigo.

**Fix sugerido**:
1. Refatorar 032 pra usar `ALTER TABLE` aditivo (drop legacy zone_id column, add waiter_id) em vez de `DROP TABLE + CREATE`.
2. Adicionar `IF NOT EXISTS` em todos `CREATE INDEX` da migration.
3. Removendo drops permanentes — migration deve ser idempotente sem perda.
4. Backfill no migrate-tenants.ts mais conservador: NÃO marcar nenhuma migration que tenha DROP TABLE como done implicitamente.

---

## B-NEW-30 · staff.verifyPin throttle só por staffId — bypass com lista (P2)

**Severidade**: **P2**.

**Source**: `apps/api/src/modules/staff/staff.service.ts:210-251` + `staff.controller.ts:47-51`.

`verifyPin` faz throttle Redis com key `staff:pin_attempts:${id}` — incrementa por staffId. Após 5 tentativas falhas, lock por 5min em `staff:pin_lock:${id}`.

**Bug**: 
1. `GET /:slug/staff` (linha 47-51) é PÚBLICO (sem guard). Atacante baixa lista de staffIds + names + roles do tenant.
2. Para cada staffId, atacante tem 5 tentativas antes do lock. PIN é 4-6 dígitos.
3. Sem rate limit GLOBAL (nem por IP, nem por endpoint), atacante distribui guesses entre N staff IDs — N×5 tentativas antes que QUALQUER staff lock-out impeça o ataque (cada staff tem seu lock independente).

**Cálculo**: 10 staff × 5 attempts = 50 PIN attempts antes de qualquer lock. Pra PIN 4-digit (10000 combos), espaço efetivo = 50/10000 = 0.5% chance. Cumulativo, atacante eventualmente acerta.

Pior pra restaurantes pequenos com 3-4 staffs e PINs comuns (1234, 0000, ano de aniversário). 

**Fix sugerido**:
1. Adicionar throttle GLOBAL por IP (ex.: `throttle:pin:${ip}` — 20 attempts/15min total).
2. Esconder `GET /:slug/staff` pra não vazar staffIds (ou retornar list sem IDs, só nomes; UI pega ID via name+pin no /verify-pin com username flag).
3. Forçar PIN ≥ 6 digits com complexidade mínima.

---

## B-NEW-31 · GET /:slug/table-merge-requests sem guard (P2)

**Severidade**: **P2**.

**Source**: `apps/api/src/modules/table-merge/table-merge.controller.ts:100-106`.

```ts
@Get()
async list(@Query() q: ListQueryDto) {   // ← sem @UseGuards
  return this.service.list({
    status: q.status,
    tableSessionId: q.tableSessionId,
  });
}
```

**Bug**: Endpoint completamente público. Lista todas as solicitações de junção de mesa do tenant inteiro. Inclui `sourceTableSessionId`, `targetTableSessionId`, `requestingCustomerId`, `decidedByCustomerId` — IDs internos vazam pra qualquer um sem auth.

**Repro**: `curl 'http://api/luna/table-merge-requests'` retorna lista. Ou `?status=approved` filtra. Útil pra reconhecimento (descobre customerIds ativos pra usar em ataques B-NEW-23, B-NEW-27).

**Fix sugerido**: adicionar `@UseGuards(StaffOnlyGuard)` (ou pelo menos `SessionGuard` se houver use case customer-side, mas pelo `service.list(...)` parece staff-only).

---

## B-NEW-32 · GET /:slug/staff/sessions/:tableSessionId/flags sem guard (P3)

**Severidade**: **P3**.

**Source**: `apps/api/src/modules/vip/vip.controller.ts:71-74`.

```ts
@Get(':tableSessionId/flags')
async list(@Param('tableSessionId') tableSessionId: string) {   // ← sem @UseGuards
  return this.service.getActiveFlags(tableSessionId);
}
```

**Bug**: Lista flags `vip`, `allergy`, `reincidente` da sessão. Sem guard. Atacante itera tableSessionIds (vazam via `GET /:slug/table-merge-requests` da B-NEW-31) e mapeia clientes VIP do tenant.

**Repro**: combo com B-NEW-31 — atacante:
1. Lista merge-requests do tenant (B-NEW-31) → coleta tableSessionIds.
2. Para cada, `GET /:slug/staff/sessions/<id>/flags` → vê quais sessões têm `vip` flag.
3. Mapeia table → cliente VIP. Útil pra phishing direcionado, social engineering.

**Fix sugerido**: adicionar `@UseGuards(StaffOnlyGuard)`. Customer-side não tem use case pra ler flags — UI customer não mostra "você é VIP" nesta forma.

---

## Outras observações (não-achados)

### B-NEW-3 (round 3) ainda existe

`emitStaffMessageRead` em `events.gateway.ts:661` ainda usa `this.server.emit` global (sem room). Round 5 PR não cobriu. Manter no backlog.

### Mongo NoSQL injection — coberto por DTOs

`threadId` em `chat-history.controller.ts` chega como `@Param()` (URL path), Express garante `string`. DTO `ThreadIdParam.threadId: @IsString()` reforça. `find({ threadId })` em `chat-history.service.ts:171` é safe — não há mass-assignment via JSON body.

`deleteAllForCustomer({ customerId })` em service.ts:246 usa string `customerId` validado por `@IsUUID` no controller (round 5 fix derivando do cookie). Safe.

### CSRF mitigado por sameSite=lax

Todas cookies `session_token`, `recognition_token` usam `sameSite: 'lax'` (`customers.controller.ts:113,193,231`, `table-session.controller.ts:41`). Browsers bloqueiam cross-origin POSTs com cookies. Aceita GETs cross-origin com cookies, mas endpoints sensitivos são todos POST/DELETE/PATCH. CSRF risk = baixa.

**Pequena melhoria** (P3): sameSite='strict' pra defesa adicional. Strict bloqueia até GET cross-site mas pode quebrar deep-link de QR scan que usa GET. Lax é compromisso razoável.

### Tenant SQL injection — defense-in-depth OK

`tenant.middleware.ts:49` valida `schema_name` via regex `/^[a-z_][a-z0-9_]{0,62}$/` antes de string-interpolar em `SET search_path = '${schemaName}'`. `ttl-tick.service.ts:80` faz a mesma validação. Mesmo o `restaurants.schema_name` venha de admin input, atacante teria que comprometer admin pra inserir schema malicioso.

### LIMIT em queries paginadas — hardcoded

`grep "ORDER BY.*LIMIT"` em apps/api/src — todos LIMITs são literais (100, 500). Sem user-controlled limit param, sem risco de DoS via `?limit=99999`.

### Migrations 001-031, 033-038 — idempotência OK

Single offender: 032 (B-NEW-29). Demais usam `IF NOT EXISTS` consistentemente.

---

## Comparação com Round 4

Round 4 cobriu **session vs staff guards** em promotions (B-NEW-8) e chat-history (B-NEW-9), mas **deixou o mesmo padrão errado em**:
- staff CRUD (B-NEW-19) ← mesma família
- dashboard (B-NEW-20) ← mesma família
- deliveries (B-NEW-21) ← mesma família  
- order updateStatus (B-NEW-24) ← mesma família
- LGPD erasure (B-NEW-23) ← mesma família

A fix do round 4 foi pontual em 2 endpoints; o **padrão sistêmico** (StaffOrSessionGuard usado onde se queria StaffOnlyGuard) ficou. **Sugestão de auditoria**: greppar todos `@UseGuards(StaffOrSessionGuard)` em mutations e justificar caso-a-caso por que session deve ter acesso. Provavelmente 80% deveriam ser StaffOnly.

Round 4 também cobriu **DTO ownership** em apenas 2 endpoints (late-arrival approve/reject + chat-history). DTOs com `customerId`/`staffId` arbitrários ainda existem em ≥6 endpoints (B-NEW-27).

---

## Recomendação de priorização

**Bloqueadores P0** (precisam ir no próximo PR):
1. **B-NEW-19** · staff CRUD guard — 5min fix por endpoint.
2. **B-NEW-20** · dashboard guard — 1 linha.
3. **B-NEW-21** · deliveries guard — 1 linha.
4. **B-NEW-22** · ManagerOnlyGuard role check via DB — ~2h (precisa schema staff_role_active).
5. **B-NEW-23** · LGPD ownership — derivar customerId do cookie, ~30min.
6. **B-NEW-24** · updateStatus session ownership — branch em service + DTO update, ~1h.

**P1 antes de release**:
7. **B-NEW-25** · ai-service auth + porta interna — 2 changes (compose + middleware).
8. **B-NEW-26** · WS join:tenant slug check — ~1h (membership lookup).
9. **B-NEW-27** · DTO ownership pattern em 6 controllers — ~3h (replicar pattern do chat-history.controller).
10. **B-NEW-28** · remover recognitionToken de welcome/recognize bodies — 5min.

**P2/P3 backlog**:
11. **B-NEW-29** · refactor migration 032 não-destrutivo.
12. **B-NEW-30** · throttle global IP + esconder /staff list.
13. **B-NEW-31, B-NEW-32** · adicionar guards faltantes — 2 linhas cada.

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 (B-NEW-8..18) |
| 5 | **6** | **4** | **3** | **1** | **14 (B-NEW-19..32)** |

Round 5 tem mais P0/P1 que Round 4 — sintoma de que o pattern de fix incompleto (StaffOrSessionGuard, DTO ownership) deixou rastros sistemáticos visíveis só em uma audit mais ampla.
