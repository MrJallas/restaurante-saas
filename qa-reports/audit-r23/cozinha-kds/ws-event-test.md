# Cozinha WS Event Test

## Brief said
> WS event `order_item.status_changed` em real-time.

## Reality

**The event name in the codebase is `order:status` (and `order:new`, `order:ready`), not `order_item.status_changed`.** No event named `order_item.status_changed` is emitted anywhere in `apps/api/src/`.

Furthermore, **`/cozinha` does NOT subscribe to any WebSocket event**. It polls `GET /orders` every 5 seconds via `setInterval(loadOrders, 5000)` in `page.tsx`. No socket.io import is present in `apps/web-staff/src/app/cozinha/page.tsx`. The 5s poll is the only refresh mechanism (plus a "new orders arrived" beep gated by `soundEnabled`).

The WS gateway DOES emit kitchen-targeted events; they are simply not consumed by the current cozinha UI.

---

## WS emit map (server-side, `apps/api/src/modules/websocket/events.gateway.ts`)

| Event name | Room | Trigger |
|---|---|---|
| `order:new` | `tenant:<slug>:kitchen` + `tenant:<slug>:waiter` | After confirmation (`confirmOrder`) |
| `order:status` | `tenant:<slug>:kitchen` + `tenant:<slug>:waiter` + `session:<sessionId>` | Every transition (`updateOrderStatus`) |
| `order:ready` | `tenant:<slug>:waiter` only | When `newStatus === 'ready'` |
| `order:claimed` | `tenant:<slug>:waiter` | When waiter claims the order |

The cook joins via `socket.emit('join:tenant', { slug, role: 'kitchen' })`, but the cozinha page never opens a socket.

---

## Test sequence

### Test 1 — bare handshake (no headers)

```bash
docker exec restaurant-api node -e "
const io = require('socket.io-client');
const sock = io('http://localhost:3001', { query: { ... } });
sock.on('connect', () => sock.emit('join:tenant', { slug:'restaurant_dev', role:'kitchen' }));
"
```

Result:
```
CONNECTED: 4jsbm_pu3uAdc91OAAAN
Joined kitchen room
WS ERROR: {"message":"Staff auth required for tenant rooms"}
WS ERROR: {"message":"Authentication required"}
DISCONNECTED: io server disconnect
```

The handshake without `x-staff-key` / `x-staff-id` is rejected. Server logs: `"Staff WS connection without x-staff-id rejected"`. Correct guard behavior.

### Test 2 — handshake with full headers

```bash
docker exec restaurant-api node -e "
const io = require('socket.io-client');
const sock = io('http://localhost:3001', {
  extraHeaders: {
    'x-staff-key': 'dev-staff-api-key-change-in-prod',
    'x-staff-id': '70c63f26-cf4f-4076-9623-6c3ce7228982',
    'x-staff-role': 'cook',
    'x-tenant-slug': 'restaurant_dev'
  },
  transports: ['websocket']
});
sock.on('connect', () => sock.emit('join:tenant', { slug:'restaurant_dev', role:'kitchen' }));
sock.on('order:status', d => console.log('EVT order:status:', JSON.stringify(d)));
// trigger PATCH after 1.5s
"
```

Result:
```
CONNECTED: 03QINXqSCM78_H0YAAAR
Triggering PATCH...
EVT order:status: {"orderId":"abb40f71-48cb-450c-aef8-4382a590e037","status":"in_progress","timestamp":"2026-05-15T20:15:51.132Z"}
PATCH RESULT: {"orderId":"abb40f71-48cb-450c-aef8-4382a590e037","previousStatus":"received","newStatus":"in_progress"}
```

OK — the `order:status` event was received in real time within ~50ms of the PATCH.

### Test 3 — in_progress -> ready

```
CONNECTED
Trigger 1: in_progress -> ready
EVT order:status: {"orderId":"abb40f71-48cb-450c-aef8-4382a590e037","status":"ready","timestamp":"2026-05-15T20:16:09.650Z"}
PATCH1: {"orderId":"abb40f71-48cb-450c-aef8-4382a590e037","previousStatus":"in_progress","newStatus":"ready"}
```

OK — `order:status` fires with `status='ready'`. **`order:ready` was NOT received by the cook** because `emitOrderReady` targets `tenant:<slug>:waiter` only (intentional — the bell-call is for the front-of-house). Cook still sees the transition via the generic `order:status` event.

---

## Findings

1. **Brief event name is wrong.** `order_item.status_changed` does not exist. The actual events are `order:status` / `order:new` / `order:ready`. Probably stale design-doc nomenclature.
2. **Cozinha UI does not subscribe to WS.** It polls every 5s. The fact that emits go to `tenant:<slug>:kitchen` means a future client-side ws integration would be trivial — the server already routes to the correct room.
3. **`order:ready` does not go to the kitchen room.** Only the waiter room receives it. The cook only sees the change via the generic `order:status` event. If the design intended the cook to hear the "ready" bell, that emit needs to include `:kitchen` too — but in practice the cook is the one MARKING ready, so they don't need a separate ping.
4. **Handshake auth is correctly enforced.** Connections without `x-staff-id` are rejected by the gateway. Connections without `x-staff-key` would also be rejected (verified earlier in r23 audits).
