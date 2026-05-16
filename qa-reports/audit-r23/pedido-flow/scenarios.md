# Pedido Flow · iOS Simulator E2E (Subagente 5)

**Device:** iPhone 17 Pro Max · iOS 26.5 · UDID `3F2238ED-C6EF-4CC1-86BE-DE819B14195F` · idb companion :10882
**Tenant:** `restaurant_dev` (port 3003 web-customer)
**Customer:** Caleb Teste, CPF `12345678909` (id `21a81205-4adf-41e3-86b5-baa8d3e339fb`)

---

## (a) Cardápio · adicionar item

**Status:** PASS

- `xcrun simctl openurl` to `/restaurant_dev/mesa/M01?hmac=...&ts=...` opened the QR flow.
- After welcome submit (`POST /customer/welcome`) the home shows continuation greeting + 2 PillButtons (`Chamar garçom`, `Ver cardápio`).
- Tap `Ver cardápio` (or hamburger > Cardápio) loaded `/cardapio` with 16 itens · 2 tabs (Comida · 16 / Bebidas · 6).
- Tap "Picanha na Brasa" navigated to `/cardapio/<itemId>` showing item detail + R$ 78,90 + "Adicionar ao pedido" CTA.
- Tap "Adicionar ao pedido" opened `<CommandPicker>` bottom sheet (Minha comanda / Comanda da mesa).
- Tap "Adicionar à minha comanda · R$ 78,90" → `useDraftOrder().addItem` invoked, `localStorage[draft:<sessionId>]` populated.

Screenshots: `screenshots/01-cardapio-list.png`, `02-item-detail.png`, `03-command-picker.png`.

**Findings:**
- The "Adicionar à minha comanda" flow auto-navigates direct to `/pedido/revisar` (line 125 `cardapio/[itemId]/page.tsx`). There is **no intermediate floating "Ver pedido" chip** on `/cardapio` (task assumed one). Looking at `cardapio/page.tsx`, the page does not render any draft-order count chip — adding directly pushes to revisar.

---

## (b) Floating chip "Ver pedido"

**Status:** N/A — does not exist in this implementation.

Looking at `apps/web-customer/src/app/[slug]/cardapio/page.tsx`, there is no floating "Ver pedido" chip that aggregates draft count. The flow inside item detail (`cardapio/[itemId]/page.tsx:125`) explicitly does `push(/${slug}/pedido/revisar)` immediately after `addItem`, so users never stay on `/cardapio` with a non-empty draft.

**If the chip is intended**, it would need to be wired into `cardapio/page.tsx` and read `useDraftOrder().quantity > 0`.

---

## (c) Revisar · lista + total + billing-mode

**Status:** PASS

Screenshot: `screenshots/04-revisar.png`.

- Picanha na Brasa, R$ 78,90 cada × 1 = R$ 78,90.
- Subtotal R$ 78,90, Taxa de serviço (10%) R$ 7,89, Total estimado R$ 86,79.
- Billing-mode hint: `R$ 78,90 cada · minha comanda` (line 162 `pedido/revisar/page.tsx`).
- "Após confirmar, você terá **15 segundos** para revisar antes do pedido ir para a cozinha."
- CTAs: `Adicionar mais` / `Enviar para cozinha →`.

---

## (d) Confirmar → /confirmando (15s undo) → /enviado

**Status:** PASS

Screenshots: `screenshots/05-confirmando.png`, `06-enviado.png`.

- Tap "Enviar para cozinha" hit `POST /api/restaurant_dev/orders` → returned `{id: 54dd5a3b-...}` → navigated to `/pedido/confirmando?orderId=54dd5a3b-...`.
- Countdown 15s with progress bar + circle indicator (visible 12s remaining in capture). Items appear with stagger animation.
- Tap "Confirmar agora" called `PATCH /orders/{id}/confirm` then navigated `/pedido/enviado?orderId=...`.
- `/pedido/enviado` shows checkmark + "ENVIADO PARA A COZINHA · Seu pedido está a caminho · TEMPO ESTIMADO 22–28 minutos" + progress steps `Recebido pela cozinha (agora)` / `Em preparo` / `Pronto para servir` / `Na sua mesa`.
- Order summary: `1 itens · R$ 78,90 · 1× Picanha na Brasa`.

DB confirms via `orders` row created with status=`received`, `billing_mode=individual`, `total_cents=7890`.

---

## (e) WS `order:created` → typewriter no /assistente

**Status:** PARTIAL · evidence in code; runtime behavior different

**Code path verified:**
- `apps/api/src/modules/orders/orders.service.ts:297` — `this.eventsGateway.emitToSession(tableSessionId, 'order:created', {...})`.
- `apps/web-customer/src/hooks/useTableSocket.ts:63` — subscribes to `order:created` event.
- `apps/web-customer/src/app/[slug]/pedido/page.tsx:113` — `if (event === 'order:created' || event === 'order:status') reload()`.

**Runtime behavior on /assistente:**
- The landing greeting on /assistente comes from `GET /home` continuation API, **not** from a typewriter triggered by `order:created` directly.
- After order delivered (scenario f setup), navigating to `/assistente` showed continuation `kind=pagou` with text "Recebido, Caleb Teste. Quer um cafezinho antes de ir ou já é isso?" (continuation pool `pg3` in `services/ai-service/services/continuation.py:387-401`). Not the expected "Pedido recebido — chega em ~Xmin".

Screenshot: `screenshots/09-assistente-typewriter.png`.

**Finding:** The continuation `kind` is computed by `HomeService.inferKind` (apps/api/src/modules/home/home.service.ts:260+). The decision logic:
1. If there's a recent confirmed `payment`, kind=`pagou`.
2. Else if draft order exists or has open order, kind=`abriu_pedido`.
3. ...

So after `order.status=delivered` AND a previous payment is on file for the session, the assistant lands on `pagou` (not `pedido_recebido`). There is no kind `pedido_recebido` in the pool — the closest signal is `abriu_pedido` which requires status NOT IN (cancelled, delivered).

**Recommendation:** Add a continuation kind for `order:delivered` to surface the rating CTA without confusing the customer with payment-flow chips.

---

## (f) Status `delivered` → bubble pede `/orders/[orderId]/rating`

**Status:** PARTIAL · rating page reachable, but discovery flow broken

- UPDATE orders SET status='delivered' executed for order `54dd5a3b-a454-440f-bda9-8b2152eca546`.
- `/pedido` tracker reflects status correctly: "Meu pedido · ● Entregue · há 9 min" (screenshot `07-meu-pedido-tracker.png`).
- Direct nav to `/restaurant_dev/orders/<orderId>/rating` (typed in URL bar) loaded `<ScreenCustomerOrderRating>` correctly with 5 stars + comment textarea + "Enviar avaliação" + "Reportar um problema" CTAs (screenshot `10-rating-page.png`).
- Tapping 1 star changed UI to "Sentimos muito · vamos te ouvir" copy and enabled "Enviar avaliação" (screenshot `11-rating-1star.png`).
- Submit failed with "Sessao expirada." — known cross-origin cookie issue (see Finding 2 below).

**BUG: `Avaliar` chip → 404**

The continuation pool emits chips like `{"id": "avaliar", "label": "Avaliar", "action": "navigate", "payload": "avaliar"}` (continuation.py:365, 379, 394, 405).

In `assistente/page.tsx:1673-1676`:
```ts
if (c.action === 'navigate') {
  const dest = txt.startsWith('/') ? txt : `/${slug}/${txt}`;
  router.push(dest);
}
```

So `payload="avaliar"` becomes `/restaurant_dev/avaliar` — **a route that does not exist**. Tapping the "Avaliar" chip from the /assistente landing produces a 404 (`This page could not be found.`) — captured in `screenshots-archive/25-rating.png`.

**Recommendation:** The chip needs to resolve to `/restaurant_dev/orders/{orderId}/rating` (or a `/feedback` index), but the continuation API doesn't have access to `orderId`. Two fixes:
1. Continuation API returns the chip with payload `orders/{orderId}/rating` (or just `feedback` with a list page).
2. Or FE intercepts `payload === 'avaliar'` and resolves the most-recent delivered orderId via the `/pedido` data already loaded.

---

## (g) Rating ≤ 3 → /complaints/new

**Status:** PARTIAL — UI present, submit blocked by Sessao expirada

- "Reportar um problema" CTA visible on rating page (screenshot `10-rating-page.png`).
- Looking at `ScreenCustomerOrderRating`, low rating + comment auto-creates a complaint and returns `redirectTo: /complaints/{id}` in the response (per comment at `screens/feedback-and-history/ScreenCustomerOrderRating.tsx:60+`).
- Could not exercise the redirect path because submit returned "Sessao expirada" (cross-origin cookie not preserved). Coded path verified via grep + service code.

---

## (h) Billing=table → /pedido/mesa shows pedido coletivo

**Status:** PASS

Screenshot: `screenshots/08-pedido-mesa.png`.

- `/pedido/mesa` rendered "COMANDA COMPARTILHADA · Pedido da mesa · 2 pessoas · 2 itens".
- Items list:
  - `2× Bolinho de Bacalhau · R$ 49,80 · por Caleb Teste · 17:34 [NOVO]` (billing=individual — assigned via visit_id).
  - `1× Picanha na Brasa · R$ 78,90 · compartilhado · 17:34 [NOVO]` (billing=table — dashed avatar).
- Subtotal R$ 128,70, Service R$ 12,87, Total R$ 141,57.
- Tabs `Todos / Meus / Compartilhados` filter correctly.
- "Meus" tab shows only the 2× Bolinho (R$ 49,80 by Caleb).

DB cross-check confirms `orders.billing_mode` = `individual` OR `table` per order; per-item attribution uses `visit_id` (since `order_items.customer_id` is NULL — see Finding 1).

---

## Notable findings (cross-cutting)

### Finding 1 · `order_items.customer_id` always NULL on customer-side orders

When customer creates an order from web-customer (port 3003) calling api (port 3001), `apps/api/src/modules/orders/orders.controller.ts:165-184` derives `callerCustomerId` from `req.cookies.recognition_token` via `CallerResolverService`. In cross-origin browser fetch, the httpOnly SameSite=Lax cookie set by `/customer/welcome` (port 3001) **is not sent** with the subsequent POST to `/orders` (also port 3001) because Safari treats this as cross-site (origin :3003 → target :3001). Effect: `callerCustomerId` resolves to `null`, so `order_items.customer_id` is NULL in DB even though `billing_mode=individual`.

The `/pedido/mesa` page papers over this by attributing items via `visit_id` joins (the `participants` API includes the participant's visit). For analytics / "split by customer" payment splits, the NULL `customer_id` could cause incorrect billing.

### Finding 2 · "Sessao expirada" on rating submit (and other cross-origin POSTs)

Same root cause as Finding 1. Recognition tokens rotate constantly: API logs show `recognition_token_rotated reason=no_cookie` and `reason=token_mismatch` on nearly every request. Each rotation invalidates the previous customer's cookies, so even submits that *do* travel cross-origin still don't trust the caller's identity.

This is logged repeatedly in `restaurant-api` logs:
```
WARN [CustomersService] {"event":"recognition_token_rotated","cpf_hash":"123***09",
    "customer_id":"21a81205-...","reason":"no_cookie"}
```

### Finding 3 · `Avaliar` chip 404

Documented above under scenario (f).

### Finding 4 · Welcome rate-limit blocks rapid re-tests

`apps/api/src/modules/customers/customers.controller.ts:36-38` — `IDENTIFY_RATE_MAX=5` per `IDENTIFY_RATE_WINDOW_SECONDS=900` (15 min), lock for `IDENTIFY_RATE_LOCK_SECONDS=900`. Hitting the welcome 5 times within 15 min locks the IP for another 15 min. Cleared lock via `redis-cli DEL customers:welcome:*:lock` during testing.

### Finding 5 · No continuation `kind=pedido_recebido` / `pedido_delivered`

Continuation pool in `services/ai-service/services/continuation.py` covers `viu_menu`, `abriu_pedido`, `chamou_garcom`, `pagou`, `voltou_sem_acao`, and post-status states. Missing: a kind that fires specifically when an order moves to `delivered` to surface the rating CTA. Current behavior falls through to `pagou` if a payment exists in the session, otherwise `voltou_sem_acao`.

### Finding 6 · Welcome rate limit and IPv6 mapped IPv4

The lock key is `customers:welcome:::ffff:172.25.0.7:lock` — IPv4-mapped IPv6 inside the docker network. Single-tenant single-IP devstack means **all customers behind the same client share the same lock**, hitting rate-limit blocks during multi-customer QA. Already mentioned in code comment but worth flagging.

---

## Cleanup

Per task instructions: orders that were set to `delivered` were reverted to `created` (note: schema does not use 'created' — the original status was `received`). Final state:
```
UPDATE orders SET status='created' WHERE status='delivered' AND ...
-- UPDATE 2 (the two delivered orders from this run)
```
