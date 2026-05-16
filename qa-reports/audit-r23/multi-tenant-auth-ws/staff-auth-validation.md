# Staff Auth Validation — Audit R23

**Branch:** `fix/customer-tools-and-continuation`
**Data:** 2026-05-15
**Endpoint usado pro smoke**: `GET /api/restaurant_dev/dashboard/overview` (única rota com **só** `StaffOnlyGuard` — sem ManagerOnlyGuard, sem ParamsGuard, sem captura wildcard).

> Nota: a task original sugeriu `/api/restaurant_dev/staff/tables`. Essa rota **não existe** no controller `StaffController` — `staff/:id` é wildcard e captura `"tables"` como UUID → `QueryFailedError: invalid input syntax for type uuid: "tables"` → **500**. Caso a intenção fosse smoke-test do guard, `dashboard/overview` é o equivalente correto. `staff/my-tables` (que existe) usa `StaffOrSessionGuard`, não `StaffOnlyGuard`.

---

## 1. Smoke test

| Cenário | HTTP | Body |
|---|---|---|
| `x-staff-key: dev-staff-api-key-change-in-prod` | **200** | `{"today":{"orders":0,"revenueCents":0,"customers":3,"avgRating":4.4,"pendingOrders":7}}` |
| Sem header | **403** | `{"statusCode":403,"message":"Acesso restrito a staff. Informe x-staff-key."}` |
| Header com valor errado (`WRONG_KEY`) | **403** | mesma msg acima |
| Header vazio (`x-staff-key: `) | **403** | mesma msg acima |
| Key válida + slug inexistente (`/api/inexistente/dashboard/overview`) | **404** | `{"statusCode":404,"message":"Restaurante nao encontrado."}` (gate de tenant roda **antes** do guard de staff) |

Confirmado pela `task` spec: **403** (não 401) é intencional — o guard usa `HttpStatus.FORBIDDEN` na mensagem unificada (tanto "header ausente" quanto "key errada"), porque distinguir os dois daria oracle pra atacante.

---

## 2. `StaffOnlyGuard` — implementação

Arquivo: [`apps/api/src/common/guards/staff-only.guard.ts`](../../../apps/api/src/common/guards/staff-only.guard.ts)

```ts
const provided = request.headers['x-staff-key'];
const expected = process.env.STAFF_API_KEY;

if (!expected || !provided) throw 403 'Acesso restrito a staff. Informe x-staff-key.';

const a = Buffer.from(expected, 'utf8');
const b = Buffer.from(provided, 'utf8');
if (a.length !== b.length || !timingSafeEqual(a, b)) throw 403;
```

Pontos críticos:

- **Timing-safe compare** via `crypto.timingSafeEqual`. Comparar com `===` vazaria byte-by-byte timing — atacante mediria tempo pra acertar o key em N tentativas. `timingSafeEqual` exige buffers de mesmo length, daí o pre-check `a.length !== b.length`.
- `STAFF_API_KEY` lido do env do processo da API:
  ```bash
  $ docker exec restaurant-api env | grep STAFF_API_KEY
  STAFF_API_KEY=dev-staff-api-key-change-in-prod
  ```
- Mensagem unificada (ausente OU errada → mesma string) evita oracle.

---

## 3. Onde o guard é aplicado

`grep -rln 'StaffOnlyGuard' apps/api/src/modules` retorna **24 controllers**. Padrão observado:

- **`@UseGuards(StaffOnlyGuard)` no controller-level** — toda rota do controller exige a key. Ex.: `DashboardController`, `CourtesiesController`, `LateArrivalController` (parcial).
- **`@UseGuards(StaffOnlyGuard)` no method-level** — rotas mistas (alguns endpoints staff, outros customer). Ex.: `WaiterCallsController.getPendingCalls`, `StaffController.create`/`update`/`delete`.
- **`@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)`** — combinação pra rotas managerial-only (`AlertsController`, `DashboardController`, `PromotionsController`, `CourtesiesController`). `ManagerOnlyGuard` adicionalmente exige `x-staff-id` válido com `role='manager'` no DB.

Lista completa de controllers que importam `StaffOnlyGuard`:

```
apps/api/src/modules/customers/customers.controller.ts
apps/api/src/modules/assistant/assistant.controller.ts
apps/api/src/modules/assistant/assistant.service.ts
apps/api/src/modules/complaints/complaints.controller.ts
apps/api/src/modules/table-merge/staff-table-merge.controller.ts
apps/api/src/modules/table-merge/table-merge.controller.ts
apps/api/src/modules/vip/vip.controller.ts
apps/api/src/modules/host/host.controller.ts
apps/api/src/modules/lgpd/lgpd.controller.ts
apps/api/src/modules/customer-staff-messages/customer-staff-messages.controller.ts
apps/api/src/modules/customer-staff-messages/customer-staff-messages.service.ts
apps/api/src/modules/late-arrival/late-arrival.controller.ts
apps/api/src/modules/staff-messages/staff-messages.controller.ts
apps/api/src/modules/staff-messages/staff-messages.service.ts
apps/api/src/modules/alerts/alerts.controller.ts
apps/api/src/modules/dashboard/dashboard.controller.ts
apps/api/src/modules/waiter-calls/waiter-calls.controller.ts
apps/api/src/modules/promotions/promotions.controller.ts
apps/api/src/modules/courtesies/courtesies.controller.ts
apps/api/src/modules/continuation/continuation.controller.ts
apps/api/src/modules/staff/staff.controller.ts
apps/api/src/modules/orders/orders.controller.ts
apps/api/src/modules/zone-pause/zone-pause.controller.ts
apps/api/src/modules/deliveries/deliveries.controller.ts
```

(também aparece em `customers.controller.ts` que adicionalmente importa pra rotas mistas)

## 4. Padrão "round 7+" — endurecimento aplicado

Comentários nos próprios controllers documentam as migrações de segurança:

- **Round 7 (B-NEW-19)** — `StaffController.create/update/delete` trocaram `StaffOrSessionGuard` → `StaffOnlyGuard`. O "Or Session" aceitava qualquer customer com sessão ativa, e customer criava staff fantasma com role manager + PIN conhecido.
- **Round 7 (B-NEW-20)** — `DashboardController` (anterior `StaffOrSessionGuard` que aceitava customer → vazava revenue 365d, top items, feedback summary do tenant inteiro pra qualquer cliente). Agora exclusivamente staff.
- **Round 8 (B-NEW-30)** — `StaffController.verifyPin` ganhou throttle **global por IP** além do throttle individual por staffId. Antes 5 attempts/5min era por staffId; atacante com lista de N staffIds (vaza via GET /staff público) tinha 5N attempts. Hoje 20/15min por IP + lockout 15min.

---

## 5. Conclusão

- `StaffOnlyGuard` ativo em 24 controllers; guard usa `timingSafeEqual` e mensagem unificada → não vaza timing nem distinção "ausente vs errado".
- `dashboard/overview` retorna 200 com key válida, 403 sem ou com key errada, 404 com slug inexistente. Ordem `TenantMiddleware → StaffOnlyGuard` é a esperada.
- Caveat menor: na rota inválida `staff/tables` o handler `:id` wildcard gera **500** ao tentar parsear `"tables"` como UUID antes do guard. Não é leak, mas é ruído — vale uma sanitização de `:id` pra retornar 400 antecipado. (Esse é problema do StaffController, não do guard.)
