# WebSocket Rooms & Auth — Audit R23

**Branch:** `fix/customer-tools-and-continuation`
**Data:** 2026-05-15
**Gateway:** [`apps/api/src/modules/websocket/events.gateway.ts`](../../../apps/api/src/modules/websocket/events.gateway.ts) — namespace `/`, `cors.origin` lido de `CORS_ORIGINS` env.

> **Correção em relação à task original:** a task pediu para escutar `waiter_call.created`. O nome real do evento na codebase é **`waiter:call`** (com `:` separator, room `tenant:<slug>:waiter`). O método é `EventsGateway.emitWaiterCall` (events.gateway.ts:526). Não existe `waiter_call.created`. Reportei o evento real.

---

## 1. Handshake — defesas observadas

`EventsGateway.handleConnection` (events.gateway.ts:157-264) exige na ordem:

1. **Rate-limit por IP** (round 16, B-NEW-55): `ws:handshake:<ip>` em Redis com `incr+expire(60s)`. >30 tentativas em 60s → `'Rate limit. Tente novamente em 60s.'` + disconnect. Mata DoS sem credenciais válidas.
2. **Staff auth path** (`x-staff-key` válido via `timingSafeEqual`):
   - **`x-staff-id` mandatório** (round 9, B-NEW-36). Sem ele → `'Staff WS handshake exige x-staff-id pra join:staff/manager rooms.'` + disconnect.
   - **`x-tenant-slug` mandatório** (round 14, P1-NEW-1). Sem ele → `'Staff WS handshake exige x-tenant-slug pra cross-tenant isolation.'` + disconnect. Esse campo é stamped em `client.data.staffTenantSlug` e usado em **todos** os `join:*` pra cross-check.
3. **Session auth path** (`x-session-token` válido em Redis): payload parsed via `safeJsonParse` (round 16, B-NEW-53) — JSON corrompido cai em `null` e o handshake é rejeitado em vez de crashar 5xx.
4. **Fallback**: nenhum auth válido → emit `'Authentication required'` + disconnect.

## 2. Smoke test — staff manager Erica → recebe `waiter:call`

### 2.1 Conexão

```bash
docker exec -e NODE_PATH=/repo/node_modules restaurant-api node /tmp/r23_ws_runner.js
```

Runner:

```js
const sock = io('http://localhost:3001', {
  transports: ['websocket'],
  extraHeaders: {
    'x-staff-key':   'dev-staff-api-key-change-in-prod',
    'x-staff-id':    '8bd06156-1fe5-4c18-a82d-43d38287ed4a',   // Erica
    'x-staff-role':  'manager',
    'x-tenant-slug': 'restaurant_dev',
  },
  auth: { /* same fields, fallback se proxy strip extraHeaders */ },
});
sock.on('connect', () => {
  sock.emit('join:tenant',  { slug: 'restaurant_dev', role: 'waiter' });
  sock.emit('join:manager', { managerId: '8bd06156-1fe5-4c18-a82d-43d38287ed4a' });
});
sock.onAny((ev, payload) => console.log('EVT', ev, JSON.stringify(payload)));
```

Stdout do runner:

```
CONNECTED TJglSzkr0Tum_FRBAAAT
JOINED tenant:restaurant_dev:waiter and manager:8bd0...
```

Logs API confirmam:

```
[EventsGateway] Staff client connected: TJglSzkr0Tum_FRBAAAT
[EventsGateway] Client TJglSzkr0Tum_FRBAAAT joined room tenant:restaurant_dev:waiter
[EventsGateway] Client TJglSzkr0Tum_FRBAAAT joined manager room 8bd06156-1fe5-4c18-a82d-43d38287ed4a
```

### 2.2 Trigger de evento

Direct `INSERT INTO restaurant_dev.waiter_calls` **não** dispara WS — não existe trigger Postgres → gateway. O emit é feito pelo service (`WaiterCallsService.createCall`, line 114). Trigger usado: `POST /api/restaurant_dev/waiter-calls` com `x-session-token` válido:

```bash
curl -X POST \
  -H "x-session-token: 2494fc2c-f534-4600-8f4b-8de0146e5383" \
  -H "Content-Type: application/json" \
  -d '{"reason":"serve_drink"}' \
  http://localhost:3001/api/restaurant_dev/waiter-calls
# → HTTP 201 {"callId":"de28c77b-…","status":"pending","reason":"serve_drink",…}
```

### 2.3 Evento recebido

```
EVT waiter:call {"callId":"de28c77b-e657-41c4-b120-a0a88672a30e","tableLabel":"Mesa 01","tableCode":"M01","reason":"serve_drink","timestamp":"2026-05-15T19:31:47.914Z"}
```

Round-trip POST → emit → recebimento no socket: **~2 ms** (timestamp do payload bate com o `createdAt` da resposta REST).

---

## 3. Negative-path — defesas confirmadas

| Cenário | Stdout do client |
|---|---|
| WS sem auth (sem `x-staff-key` nem `x-session-token`) | `CONNECTED` → `ERROR_EVT {"message":"Authentication required"}` → `DISCONNECT io server disconnect` |
| Staff com `x-staff-key` válido mas **sem** `x-staff-id` | `CONNECTED` → `ERROR_EVT {"message":"Staff WS handshake exige x-staff-id pra join:staff/manager rooms."}` → `DISCONNECT` |
| Staff com `x-staff-key` + `x-staff-id` mas **sem** `x-tenant-slug` | `CONNECTED` → `ERROR_EVT {"message":"Staff WS handshake exige x-tenant-slug pra cross-tenant isolation."}` → `DISCONNECT` |
| Staff válido tenta `join:tenant {slug:'restaurante_x', ...}` (slug ≠ stamped) | `CONNECTED` → `ERROR_EVT {"message":"Tenant slug mismatch"}` (socket fica aberto; só a join é negada) |

API warns nos logs:

```
WARN Staff WS connection without x-staff-id rejected: ok9r6ghCwcCVHS0CAAAZ
WARN Staff WS connection without x-tenant-slug rejected: AxPqjSXl7jdEasqbAAAb
```

> Nota sobre `socket.io`: o ack `connect` é emitido pelo client antes do server completar `handleConnection`. Por isso vemos `CONNECTED <id>` mesmo em handshakes que serão rejeitados; o `error` + `disconnect` chegam no mesmo tick. FE deve tratar `error` como gate, não `connect`.

---

## 4. Room routing — política

Documentada em comentário (events.gateway.ts:565-580):

| Room | Recebe | Quem entra |
|---|---|---|
| `tenant:<slug>` | broadcast pra TODOS dashboards staff do tenant | `join:tenant` (staff, slug carimbado no handshake bate) |
| `tenant:<slug>:<role>` | role-specific fanout (`waiter`, `kitchen`, `manager`, …) | `join:tenant` com `role` |
| `session:<id>` | UI cliente da mesa | `join:session` (customer match próprio sessionId; staff cross-checks que session pertence ao tenant) |
| `customer:<id>` | UI de um end-user específico | `join:customer` (próprio customer OU staff do mesmo tenant — `validateCustomerInTenant`) |
| `staff:<id>` | inbox pessoal do staff | `join:staff` (próprio staffId carimbado) |
| `manager:<id>` | inbox managerial | `join:manager` (próprio managerId carimbado) |

Cross-tenant defesa principal — `validateCustomerInTenant`:

- Cache `customer_tenant:<uuid>` no Redis (TTL 5min).
- Lookup confirma que `<schemaName>.customers.id = <customerId>` no schema do tenant do staff.
- Sem isso, staff de tenant A com UUID alheio (vazado em logs / migration) ouvia `complaint.responded`, `lgpd.request_fulfilled`, `late_arrival.*`, `staff_message.received` com PII de outro tenant.

---

## 5. Eventos emitidos (helpers ativos)

| Domínio | Helper | Rooms |
|---|---|---|
| Orders | `emitOrderStatusUpdate`, `emitNewOrder`, `emitOrderReady`, `emitOrderClaimed` | `tenant:<slug>:waiter` + `tenant:<slug>:kitchen` |
| Waiter call | `emitWaiterCall` | `tenant:<slug>:waiter` (evento `waiter:call`) |
| Waiter ack | `emitWaiterCallAcknowledged` | `session:<id>` (evento `waiter:acknowledged`) |
| Escalation | `emitEscalationCreated/Advanced/Completed` | tenant + staff/customer rooms |
| Late arrival | 4 helpers | tenant + customer + session |
| Table merge / cooldown | 5 helpers | tenant + session + customer |
| LGPD | `emitLgpdRequestFulfilled` (+ shortcut `emitLgpdFulfilled`) | tenant + customer |
| Complaint | `emitComplaintReceived/Responded/Read/Resolved` | tenant + customer / manager |
| Staff message | `emitStaffMessageReceived/Read` | tenant + customer + staff |
| Zone pause | `emitZonePauseStarted/Ended` | tenant + staff (waiter assigned) |
| Session flag | `emitSessionFlagChanged` | tenant + session |
| Host (recepcionista) | `emitHostTableLiberated/SwapRequested/SwapStateChanged/VipFlagged` | tenant + session |
| Alerts (manager) | `emitAlertCreated` | **broadcast global** (`this.server.emit`) — único event sem room-scope; subscribers FE filtram |

`emitAlertCreated` é o único broadcast non-scoped. Comentário no código justifica: o row carrega contexto, e o broadcast é apenas pra "wake up subscribers" do `ScreenManagerAlertsAll` (que faz re-fetch via REST). Worth flagging em audit posterior se schema multi-tenant em prod tiver dashboards online de >1 tenant simultaneamente — esse helper hoje vazaria alertas cross-tenant.

---

## 6. Conclusão

- WebSocket de staff exige **3 headers** no handshake (`x-staff-key`, `x-staff-id`, `x-tenant-slug`) — sem qualquer deles, disconnect imediato.
- Smoke positivo: Erica (`staffId=8bd06156-…`, role manager) recebeu `waiter:call` na room `tenant:restaurant_dev:waiter` ~2ms após POST do REST.
- Defesas P0 cobertas: cross-tenant slug mismatch em `join:tenant`, cross-tenant session em `join:session` (staff path), cross-tenant customer em `join:customer` (staff path com `validateCustomerInTenant` + cache Redis), staffId mismatch em `join:staff`/`join:manager`.
- Caveat: `emitAlertCreated` faz broadcast global no namespace — em deploy multi-tenant com dashboards de tenants diferentes conectados, vaza `alert.created` cross-tenant. Fix sugerido: receber `slug` no helper e usar `this.server.to('tenant:<slug>').emit(...)`.
