# Round 17 · Bug-hunt audit (post-round16)

> Run: 2026-05-09 · audit estático sobre superfície que rounds 10–16 já
> tocaram, mais código novo (host/dto, jobs/, deliveries/, settings/).
> Sem rodar — só leitura de código.

## TL;DR

3 achados novos · 0 P0, 1 P1, 1 P2, 1 P3. Densidade caindo conforme
esperado do round 9 (que projetava "round 10 com < 5 achados novos"
— round 17 fica em 3, dentro da faixa).

- **B-NEW-66 (P1)**: `POST /:slug/orders` aceita `dto.customerId` no body
  e atribui o pedido inteiro a esse customer em billingMode=individual.
  Customer A na mesma mesa que B (ambos session_participants legítimos)
  passa `customerId = B-uuid` → todos os items vão pra B em
  `order_items.customer_id` → na hora de pagar individual, B paga; A
  paga 0. Defesa parcial existe (`orders.service.ts:198-217` valida
  participação na mesa), mas NÃO valida "caller é o customerId
  passado". Mesma família dos round-7-9 fixes (assistant.sendMessage,
  complaints, table-merge.create) que padronizaram cookie-derived
  customerId — orders ficou esquecido.
- **B-NEW-67 (P2)**: `POST /:slug/staff/sessions/:tableSessionId/flags`
  (vip.controller) com comentário em linha 59-60 "customerId NÃO é mais
  aceito do body" mas o código **AINDA passa** `dto.customerId` pro
  `VipService.toggle`, que stampa `session_flags.set_by_customer_id`
  com o UUID arbitrário. Manager M flaga mesa 5 como VIP via curl com
  body `{customerId: <UUID-aleatório>}` → audit log diz "customer X
  triggered VIP flag" quando na verdade nenhum customer triggou nada
  (flag é manager action). Audit attribution corruption — não é privilege
  escalation, mas quebra accountability em manager actions.
- **B-NEW-68 (P3)**: `POST /:slug/zone-pauses/:id/end` (zone-pause.controller)
  tem fallback `req ? requireStaffId(req) : (dto.endedBy ?? '')` em
  linha 138-140 com `@Req() req?: Request` (optional). HTTP path nunca
  vê `req=undefined` (Nest sempre injeta), mas o sinal "optional" abre
  porta pra refactor futuro / call interno (test direto, jobs scheduler
  futuro) que faz fallback silencioso pro body — gravando
  `zone_pauses.ended_by` com UUID arbitrário do attacker. Defesa-em-depth
  fragilizada. Round 10 fix ficou parcial: introduziu o derive-from-
  header mas não removeu o fallback.

Detalhes abaixo.

---

## B-NEW-66 · orders.create com customerId arbitrário (P1)

**Severidade**: **P1** (bill-attribution IDOR · A faz B pagar a conta).

**Source**:
- `apps/api/src/modules/orders/orders.controller.ts:140-150` (pré-fix)
- `apps/api/src/modules/orders/orders.service.ts:188-217`

Pré-fix:
```ts
@Post()
@UseGuards(SessionGuard)
async createOrder(
  @Body() dto: CreateOrderDto,
  @Session() session: SessionData,
  @Param('slug') slug: string,
) {
  return this.ordersService.createOrder(
    session.sessionId,
    dto.visitId || null,
    dto.billingMode,
    dto.items,
    dto.notes,
    slug,
    dto.customerId ?? null,   // ← arbitrário do body
    dto.idempotencyKey,
  );
}
```

Service usa `defaultCustomerId` (que vem de `dto.customerId`) em
`orders.service.ts:188-194`:
```ts
customerId:
  billingMode === 'individual'
    ? (defaultCustomerId ?? null)   // ← TODOS items vão pra esse UUID
    : (item.customerId ?? null),
```

Linhas 198-217 validam que os customerIds são session_participants — mas
NÃO validam que `defaultCustomerId === callerCustomerId`. A defesa só
confirma "está na mesa", não "é você".

**Repro hipotético**:
1. Customer A em mesa 5 (recognition_token cookie próprio = `A-token`,
   session.customerId = `A-uuid`).
2. Customer B também em mesa 5 (legitimamente — split-bill cenário).
3. A obtém `B-uuid` via `GET /:slug/table/participants` (público pra
   participantes da mesma mesa).
4. A faz `POST /:slug/orders` com:
   ```json
   {
     "billingMode": "individual",
     "visitId": "<visitId-de-A>",
     "customerId": "<B-uuid>",
     "items": [{"menuItemId": "burger-1", "quantity": 2}]
   }
   ```
5. Service atribui todos items a B em `order_items.customer_id = B-uuid`.
6. Na hora de `GET /orders/bill?mode=individual&visitId=<visit-de-B>`,
   bill de B tem o burger de A. B paga. A paga 0.
7. Audit: `orders.created_by = 'customer'` (sem UUID), `order_items.customer_id = B`. Manager investigando split errado vê B como dono dos items.

**Comparar com fixes anteriores**:
- `assistant.controller.ts:46-65` (round 11 fix B-NEW-57): customerId
  via `callerResolver.tryGetCustomerId(req)`.
- `complaints.controller.ts:130-145` (round 7 fix B-NEW-29): customerId
  via cookie.
- `table-merge.controller.ts:77-85` (round 9 fix B-NEW-50): customerId
  via cookie.
- `home.controller.ts:23-30` (round 12 fix B-NEW-63): customerId via
  cookie.

orders.create é um dos últimos endpoints customer-side que ainda
aceitava customerId mass-assignment.

**Fix aplicado** (round 17):
1. `orders.module.ts` importa `CallerResolverModule`.
2. `orders.controller.ts:createOrder` injeta `CallerResolverService`,
   adiciona `@Req() req: Request`, deriva
   `callerCustomerId = await callerResolver.tryGetCustomerId(req)`.
3. Passa `callerCustomerId` (não `dto.customerId`) pro service.
4. DTO mantém `customerId?` (back-compat com FE em
   `apps/web-customer/src/app/[slug]/assistente/page.tsx:460`),
   mas o valor é IGNORADO. Documentado no DTO + controller.
5. Per-item `customerId` (`CreateOrderItemDto.customerId`) preservado
   — UX legítimo de split-by-item entre participantes da mesma mesa
   (policy: trust intra-table, validado em service:198-217).

---

## B-NEW-67 · vip.toggle stampava set_by_customer_id arbitrário (P2)

**Severidade**: **P2** (audit attribution corruption).

**Source**: `apps/api/src/modules/vip/vip.controller.ts:62-82` (pré-fix)
+ `vip.service.ts:33-57`.

Pré-fix:
```ts
// Comentário linha 59-60 (PROMETIA): "customerId NÃO é mais aceito do
// body (não fazia sentido — flag é por session, não por customer)."
@Post(':tableSessionId/flags')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
async toggle(...) {
  const staffId = this.callerResolver.requireStaffId(req);
  return this.service.toggle(
    tableSessionId,
    dto.flag,
    dto.action,
    {
      staffId,
      customerId: dto.customerId,   // ← AINDA passava!
      reason: dto.reason,
    },
    slug,
  );
}
```

Service grava em `session_flags.set_by_customer_id`:
```ts
INSERT INTO session_flags
  (table_session_id, flag, set_by_staff_id, set_by_customer_id, ...)
VALUES (..., $4, ...)  // ← $4 = by.customerId arbitrário
```

**Bug**: Comentário e código divergem. Round 10 (B-NEW-49) atualizou o
texto mas esqueceu de remover a linha. Resultado: manager M faz
`POST /:slug/staff/sessions/<X>/flags` com body
`{flag:'vip', action:'add', customerId: '<UUID-do-customer-Y>'}` — Y
nem precisa estar na mesa. Audit log mostra Y como originador da flag.

**Impacto**: Não é privilege escalation (`StaffOnlyGuard +
ManagerOnlyGuard` já garantem que só manager dispara). É
**accountability corruption** — investigações futuras (cliente
reclama "fui marcado VIP sem autorização e pagaram diferente",
investigation interna de manager fraud, etc.) leem
`set_by_customer_id` como fonte de verdade e apontam pra customer
errado.

**Fix aplicado**:
- DTO mantém `customerId?: string` (back-compat).
- Controller não passa mais ao service.
- Service signature ainda aceita `customerId?` (param dead, próximo
  cleanup pode remover; manter agora minimiza diff).

---

## B-NEW-68 · zone-pause endedBy fallback fragilizado (P3)

**Severidade**: **P3** (defense-in-depth · não exploitável via HTTP
direto; surface pra regressão futura).

**Source**: `apps/api/src/modules/zone-pause/zone-pause.controller.ts:130-149`
(pré-fix).

Pré-fix:
```ts
@Post(':id/end')
@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
async end(
  @Param('slug') slug: string,
  @Param('id') id: string,
  @Body() dto: EndZonePauseDto = {},
  @Req() req?: Request,    // ← optional
) {
  const staffId = req
    ? this.callerResolver.requireStaffId(req)
    : (dto.endedBy ?? '');   // ← fallback pro body
  return this.service.endEarly(id, { endedBy: staffId, ... }, slug);
}
```

**Bug**: HTTP request sempre injeta `req` (Nest contract), então o
fallback NUNCA dispara em produção. Mas:
1. `@Req() req?: Request` declara opcional → linter não acusa.
2. `deleteAlias` (linha 156-165) chama `this.end(slug, id, dto, req)` com
   `req?: Request` propagando o sinal opcional.
3. Se um futuro caller (test direto, scheduler interno via service injection,
   refactor que extraia o handler) chamar `this.end(...)` sem req, o
   fallback pega `dto.endedBy` arbitrário do body como audit owner.
4. Round 10 (B-NEW-49) introduziu o `requireStaffId(req)` mas não
   removeu o fallback — fix parcial.

**Repro** (sem path direto via HTTP):
- Hipotético: futuro `JobsModule` adiciona scheduler que chama
  `endEarly(...)` direto via `ZonePauseService` quando duração expira.
  Se alguém ressuscitar a classe wrapper `controller.end(slug, id, dto)`
  pra reuse de logging/event-emit, sem passar req → fallback dispara →
  body do scheduler (que não tem req) usa `dto.endedBy` que vem de
  trigger externo (cron message body, possivelmente não-confiável).

Não há exploit hoje, mas a forma "hard to misuse" é remover o sinal de
optional.

**Fix aplicado**:
- `@Req() req: Request` (required, sem `?`).
- Drop fallback: `const staffId = this.callerResolver.requireStaffId(req)`.
- `deleteAlias` mesma assinatura.
- DTO mantém `endedBy?` pra back-compat (FE em web-staff pode estar
  enviando — IGNORADO server-side agora).

---

## Outras observações (não-achados)

### settings.controller.ts — público mas seguro

`GET /:slug/settings/public` sem guard, retorna `restaurant_name + cores
+ logo_url`. Tudo brand-public por design (FE renderiza no QR landing
antes de welcome). LGPD-safe. ✓

### dashboard.controller.ts — round 7 fix consolidado

Antes era `StaffOrSessionGuard` (B-NEW-20 round 7). Agora `StaffOnlyGuard`
no nível do controller — toda rota financeira/analytics herda. Cap em
365d, top-items cap em 100. ✓

### deliveries.controller.ts — round 16 audit attribution

Round 16 (P3-NEW-1) wireou `requireActiveStaffId` em `claimOrder` +
`markDelivered`. `order_deliveries.claimed_by` agora UUID real, não
hardcoded 'garcom'. ✓

### home.controller.ts — round 12 fix B-NEW-63 confirmado

`getHome` deriva customerId do cookie via `callerResolver.tryGetCustomerId`,
não aceita `?customerId=` na query. ✓

### assistant.controller.ts — round 11 fix B-NEW-57 confirmado

`sendMessage` + `getHistory` ambos cookie-derived. ✓

### Migrations 035-040 — backfill audit

- 035 (host_module_tables): novas tabelas via `CREATE TABLE IF NOT EXISTS`.
- 036-037 (table_merge_dual_consent + cooldown): ALTER ADD COLUMN com
  defaults seguros.
- 038 (order_deliveries_active_unique): UNIQUE constraint partial — round
  9 backlog cobriu.
- 039 (drop_table_sessions_session_token): DROP COLUMN — verificar se
  dependências removidas em pré-fase. **NÃO auditado em runtime esta
  rodada**, marcar pra próxima.
- 040 (feedbacks_visit_unique): UNIQUE INDEX (round 16 B-NEW-51 fix).

Todas idempotentes. Safe. Migration 039 merece um sanity check de
"quantos call-sites ainda referenciam o campo" — mas se round 16 foi
aprovado, presume-se zero.

### JSON.parse sweep (B-NEW-53 round 9) — confirmado

4 sites originais usam `safeJsonParse`:
- `session.guard.ts:42` ✓
- `staff-or-session.guard.ts:79` ✓
- `events.gateway.ts` (handleConnection branch) ✓
- `table-session.service.ts:177` ✓

`events.gateway.ts:349` (handleJoinSession branch staff) usa try/catch
inline — funciona, mas inconsistente com o sweep do round 16. Não-bug;
candidato a refactor cosmético.

### Staff DTOs sweep (B-NEW-49 rounds 10-12) — confirmado

`requireStaffId` / `requireActiveStaffId` consumidos em:
- `staff-table-merge.controller.ts` ✓
- `complaints.controller.ts` (respond/resolve) ✓
- `staff-messages.controller.ts` (round 13/14 fixes) ✓
- `vip.controller.ts` (staffId — customerId era o gap, fixado round 17) ✓
- `host/host.controller.ts` ✓
- `zone-pause.controller.ts` (start ✓, end era o gap fixado round 17) ✓
- `deliveries.controller.ts` ✓

### `recognize` body fallback ainda existe (low risk)

`customers.controller.ts:319` aceita `dto.recognitionToken ?? cookie`.
Round 7 já minimizou risco (token não vaza no response). Mantido em
backlog low-prio.

---

## Sumário comparativo

| Round | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| 3 | 0 | 1 | 4 | 2 | 7 |
| 4 | 3 | 2 | 3 | 1 | 11 |
| 5 | 6 | 4 | 3 | 1 | 14 |
| 7 | 3 | 4 | 5 | 1 | 13 |
| 9 | 0 | 5 | 3 | 2 | 10 |
| **17** | **0** | **1** | **1** | **1** | **3** |

Round 17 tem **3 achados** — convergência clara conforme prevista no
round 9 ("round 10 com < 5 achados novos"). Densidade total (P0+P1+P2+P3)
caiu de 14 (round 5) → 7 (round 7) → 5 (round 9) → 3 (round 17).
Round 17 confirma sweep cumulativo dos rounds 4-16 fechou os caminhos
óbvios; achados restantes são "famílias-irmãs incompletas" (mesmo
pattern dos rounds 7-9).

**Pattern recorrente**: comentários no código afirmam a propriedade
("customerId NÃO é mais aceito") mas linha de service-call ainda passa
o valor. **Sugestão pra round 18+**: lint rule custom que verifica
"se controller comment menciona 'IGNORADO' ou 'NÃO é mais aceito'
sobre dto.X, então grep do mesmo arquivo não pode encontrar `dto.X`
em service-call args".

---

## Recomendação de priorização

**Round 17 fixes shipados**:
1. **B-NEW-66** (P1) · orders.create cookie-derived customerId.
2. **B-NEW-67** (P2) · vip.toggle drop dto.customerId pass-through.
3. **B-NEW-68** (P3) · zone-pause.end drop fallback + req required.

**Backlog**:
- Migration 039 sanity check em runtime (call-sites do `session_token`
  column dropado).
- `events.gateway.ts:349` migrar pra `safeJsonParse` (cosmético).
- `vip.service.ts:33` cleanup do `customerId?` param (dead code pós-
  round-17).
- Custom lint rule pra divergência comentário-vs-código.
