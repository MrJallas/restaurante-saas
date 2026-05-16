# WS `order:created` Typewriter

## Backend emission

`apps/api/src/modules/orders/orders.service.ts:296-305`:

```ts
if (this.eventsGateway) {
  this.eventsGateway.emitToSession(tableSessionId, 'order:created', {
    orderId: order.id,
    status: order.status,
    billingMode,
    totalCents,
    createdAt: order.created_at,
    timestamp: new Date().toISOString(),
  });
}
```

The event fires immediately after `INSERT` completes, **before** the kitchen receives the order (kitchen broadcast is delayed by 15s to honor the cancel window).

## Frontend subscription

`apps/web-customer/src/hooks/useTableSocket.ts:63` registers a Socket.io listener for `order:created`.

Two surfaces consume the event:

1. **`/pedido` tracker** (`apps/web-customer/src/app/[slug]/pedido/page.tsx:112-116`):
   ```ts
   useTableSocket(sessionId, (event) => {
     if (event === 'order:created' || event === 'order:status') {
       reload();
     }
   });
   ```
   Reloads the order list — used for multi-user coordination on the same table.

2. **`/pedido/mesa`** (similar pattern) reloads the shared comanda.

## On `/assistente`

Searched `apps/web-customer/src/app/[slug]/assistente/page.tsx` for `order:created` — **not found**. The /assistente page does not directly listen to this event. Its landing greeting is sourced from `GET /home` continuation API.

So the task statement "WS `order.created` deve disparar typewriter no /assistente ('Pedido recebido — chega em ~Xmin')" doesn't match the implemented behavior. The actual greeting that appears after order creation depends on the continuation `kind` returned by `HomeService.inferKind` (apps/api/src/modules/home/home.service.ts:260+):

- If a recent confirmed payment exists → `kind=pagou` → templates from `continuation.py:287-411`.
- If a draft order exists in localStorage or open order in DB (`status NOT IN ('cancelled','delivered')`) → `kind=abriu_pedido` → templates with text like "Entrou no fogão, {customerName}! Aviso assim que estiver pronto."

I observed the second case during the test: after the first order was created the home greeting was:
> ASSISTENTE · PEDIDO EM ANDAMENTO
> Entrou no fogão, Caleb Teste! Aviso assim que estiver pronto. Posso anotar mais alguma coisa?

This is the closest equivalent to the expected "Pedido recebido — chega em ~Xmin" — but the ETA is **not** included in the continuation template (slots are `customerName` only).

## Observed continuation kinds during this run

From `restaurant-api` logs:

```
DEBUG [HomeService] continuation kind=voltou_sem_acao session=bd771b4d-...
DEBUG [HomeService] continuation kind=abriu_pedido session=bd771b4d-...
DEBUG [HomeService] continuation kind=voltou_sem_acao session=8e5545ab-...
DEBUG [HomeService] continuation kind=pagou session=8e5545ab-...
```

`kind=pagou` was selected after I navigated back to /assistente post-delivered (the session had a prior `confirmed` payment record on file, see `apps/api/src/modules/home/home.service.ts:263-274`).

## Conclusion

| Check | Result |
|---|---|
| WS event `order:created` emitted on order creation | YES — verified in source |
| FE subscribes to `order:created` | YES — `useTableSocket` hook |
| `/assistente` shows typewriter triggered by `order:created` | NO — the page uses continuation API, not a direct WS listener |
| Continuation kind reflects post-creation state | PARTIAL — `abriu_pedido` if order open, `pagou` if payment exists, `voltou_sem_acao` otherwise. No `pedido_delivered` kind exists. |

The /pedido and /pedido/mesa pages DO react to `order:created` (refetch on the fly). /assistente doesn't.
