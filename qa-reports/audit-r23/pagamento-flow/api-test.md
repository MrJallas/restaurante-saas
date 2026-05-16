# API tests — Pagamento (via curl)

Setup: active `table_session_id = 8e5545ab-5d27-4012-9a1f-9ede72b23d0e` (M01, Caleb visit `61e4f693-7bc0-480b-a701-1724bad4ed31`), bill total `R$ 128,70` (2 orders, items "Bolinho de Bacalhau" 2× + "Picanha na Brasa" 1×).

Auth: cookie `session_token=<session_id>` (SessionGuard via `cookie-parser`). `x-session-token` header não funciona — apenas cookie.

## T1. GET `/payments` (list)
```bash
curl -s http://localhost:3001/api/restaurant_dev/payments \
  -H "Cookie: session_token=$SESSION"
```
**Result**: 3 historic payments retornados (expired/cancelled/cancelled). Fields: `id, visitId, amountCents, status, method, paidAt, createdAt, expiresAt, cancelledAt`. ✓

## T2. GET `/orders/bill?mode=table`
```bash
curl -s "http://localhost:3001/api/restaurant_dev/orders/bill?mode=table" \
  -H "Cookie: session_token=$SESSION"
```
**Result**: `totalCents=12870, orderCount=2, orders=[...]`. Cada order tem `billing_mode='individual'`, items com `customerId`. Field `perVisit=[]` retornado também (mode=table não preenche). ✓

## T3. POST `/payments` — mode=table (FALHA esperada)
```bash
curl -s -X POST http://localhost:3001/api/restaurant_dev/payments \
  -H "Cookie: session_token=$SESSION" -H "Content-Type: application/json" \
  -d '{"mode":"table","method":"pix"}'
```
**Result**: `{"error":"Bad Request","message":"Nenhum valor pendente para pagamento."}`. **CAUSA**: service SQL na linha 75–82 filtra `billing_mode = 'table'` — mas os orders existentes estão em `billing_mode = 'individual'`, então `SUM(total_cents) = 0`. Sintoma normal pra mesa em modo individual. ✓

## T4. POST `/payments` — mode=individual (SUCESSO)
```bash
curl -s -X POST http://localhost:3001/api/restaurant_dev/payments \
  -H "Cookie: session_token=$SESSION" -H "Content-Type: application/json" \
  -d '{"mode":"individual","method":"pix","visitId":"61e4f693-7bc0-480b-a701-1724bad4ed31"}'
```
**Result**:
```json
{
  "paymentId": "5fad9709-7eb0-4885-b628-890b5b245574",
  "status": "pending",
  "amountCents": 12870,
  "method": "pix",
  "pixQrCode": "00020126580014BR.GOV.BCB.PIX0136acb7fc1c-901b-48db-9c04-66022ab4a73c5204000053039865406128.705802BR",
  "pixCopyPaste": "00020126580014BR.GOV.BCB.PIX0136acb7fc1c-901b-48db-9c04-66022ab4a73c5204000053039865406128.705802BR",
  "expiresAt": "2026-05-15T20:54:35.004Z",
  "createdAt": "2026-05-15T20:44:35.004Z"
}
```
✓ Pix code generated (`BR.GOV.BCB.PIX` prefix valid), `pixCopyPaste = pixQrCode`, expires_at = createdAt + 10min ✓.

## T5. GET `/payments/:id` (polling pending)
```bash
curl -s "http://localhost:3001/api/restaurant_dev/payments/5fad9709-7eb0-4885-b628-890b5b245574" \
  -H "Cookie: session_token=$SESSION"
```
**Result**: `status:'pending', amount:12870`. ✓

## T6. POST `/payments/:id/confirm` — pending → confirmed
```bash
curl -s -X POST "http://localhost:3001/api/restaurant_dev/payments/$PID/confirm" \
  -H "Cookie: session_token=$SESSION" -H "Content-Type: application/json" -d '{}'
```
**Result**: `{"paymentId":"5fad...","status":"confirmed"}` ✓

## T7. GET status pós-confirm (transition reflete)
**Result**: `status:'confirmed', paidAt:'2026-05-15T20:44:42.701Z'` ✓ — `paid_at` populado pelo SQL `UPDATE … SET status='confirmed', paid_at=now()`.

## T8. PATCH `/payments/:id/cancel`
```bash
# Cria payment novo
CANCEL_RESP=$(curl -s -X POST ... mode=individual ...)
CPID=$(echo "$CANCEL_RESP" | jq -r '.paymentId')
# Cancela
curl -s -X PATCH "http://localhost:3001/api/restaurant_dev/payments/$CPID/cancel" \
  -H "Cookie: session_token=$SESSION"
```
**Result**: `{"paymentId":"b9152...","status":"cancelled"}` ✓ — `cancelled_at` populado, dedup key liberado (próximo POST não bate em "Ja existe um pagamento pendente").

## T9. Tenant/session isolation (P1 fix)
```bash
curl -s "http://localhost:3001/api/restaurant_dev/payments/5fad9709..." \
  -H "Cookie: session_token=00000000-0000-0000-0000-000000000000"
```
**Result**: `{"statusCode":401,"message":"Sessao expirada. Escaneie o QR Code novamente."}` ✓ — SessionGuard rejeita antes do service. Ownership filter (`table_session_id = $2`) defense-in-depth no service.

## T10. Method validation
```bash
curl ... -d '{"mode":"individual","method":"invalid","visitId":"..."}'
```
**Result**: `{"statusCode":400,"message":["method must be one of the following values: pix, card, cash, credit, debit"]}` ✓ class-validator DTO funcionando.

## T11. POST `/payments/bill/split/compute`
```bash
curl -s -X POST .../payments/bill/split/compute \
  -d '{"mode":"equal","participants":["21a81205-4adf-41e3-86b5-baa8d3e339fb"]}'
```
**Result**:
```json
{
  "mode": "equal",
  "totalCents": 12870,
  "allocations": [{"customerId":"21a81205-...","amountCents":12870}]
}
```
✓ — 1 participante leva 100% (correto). Floor+remainder logic na linha 481–486 do service.
