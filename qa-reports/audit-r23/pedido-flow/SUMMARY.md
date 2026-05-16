Subagent: pedido-flow
Status: PARTIAL (4 PASS · 1 N/A · 3 PARTIAL · 5 bugs novos: 2 P1, 1 P2, 2 P3)

Device: iPhone 17 Pro Max 3F2238ED via idb localhost:10882
Branch: fix/customer-tools-and-continuation
Customer: Caleb Teste CPF 12345678909, customerId 21a81205-4adf-41e3-86b5-baa8d3e339fb

## Scenario matrix

| # | Cenário | Status | Notes |
|---|---|---|---|
| a | /cardapio add item | ✅ PASS | Picanha → CommandPicker → revisar |
| b | Floating "Ver pedido" chip | ⚠️ N/A | NOT implemented — direct push to /revisar after add |
| c | /pedido/revisar lista + total + billing-mode | ✅ PASS | R$ 78,90 + R$ 7,89 (10%) = R$ 86,79 |
| d | Confirmar → /confirmando (15s undo) → /enviado | ✅ PASS | POST /orders → countdown → confirmar agora → enviado |
| e | WS order:created → typewriter no /assistente | ⚠️ PARTIAL | WS emits, /pedido reacts; /assistente usa continuation API, NÃO WS |
| f | status=delivered → rating page reachable | ⚠️ PARTIAL | Page works via direct URL; "Avaliar" chip 404s |
| g | Rating ≤ 3 → /complaints/new | ⚠️ PARTIAL | UI present; submit blocked por "Sessao expirada" |
| h | billing=table → /pedido/mesa | ✅ PASS | 2 pessoas · 2 itens with proper attribution |

## Bugs novos / Achados

### 🔴 BUG 1 P1 — Chip "Avaliar" → 404
- Continuation chips com `action='navigate', payload='avaliar'` resolvem `/restaurant_dev/avaliar` — rota NÃO existe
- 404 capturado em screenshots-archive/25-rating.png
- Definitions: `services/ai-service/services/continuation.py:365,379,394,405`
- Handler: `apps/web-customer/src/app/[slug]/assistente/page.tsx:1673-1676` (`dest = txt.startsWith('/') ? txt : '/${slug}/${txt}'`)
- **Fix sugerido**: chip payload deveria ser `feedback` (com nova rota) OU FE deveria resolver `orderId` de session data e produzir `orders/{id}/rating`

### 🔴 BUG 2 P1 — order_items.customer_id=NULL em cross-origin
- Recognition cookie (httpOnly SameSite=Lax) NÃO é enviado em cross-origin fetch (web-customer :3003 → api :3001)
- `CallerResolverService` retorna null → `order_items.customer_id` é NULL mesmo com `billing_mode=individual`
- Per-customer billing/split logic relies em `visit_id` join como fallback, **mas analytics undercountam**
- API logs flood: `recognition_token_rotated reason=no_cookie` e `reason=token_mismatch`
- Controller: `apps/api/src/modules/orders/orders.controller.ts:165-184`
- **Fix sugerido**: same-origin proxy (`/api/*` rewrite via Next.js) OU `SameSite=None; Secure` sobre HTTPS

### 🟡 BUG 3 P2 — "Sessao expirada" no rating submit
- Mesma raiz do Bug 2 — rating POST perde rotating recognition_token
- Não conseguiu exercitar `<=3` rating → complaint redirect path end-to-end

### 🔵 BUG 4 P3 — No `pedido_delivered` continuation kind
- After status=delivered, /assistente cai em `kind=pagou` (se há prior payment) OU `voltou_sem_acao`
- Rating CTA surfaces only via `pagou` chips (chip "Avaliar" quebrado do Bug 1)
- **Fix sugerido**: adicionar kind `pedido_delivered` em `services/ai-service/services/continuation.py` e priorizar em `apps/api/src/modules/home/home.service.ts:260+`

### 🔵 BUG 5 P3 — Welcome rate limit muito agressivo pra dev
- 5 attempts/15 min → 15 min IP lock
- Em docker dev, TODOS customers compartilham `::ffff:172.25.0.7` → multi-customer QA bate no lock
- Cleared via `redis-cli DEL customers:welcome:*`
- Constants em `apps/api/src/modules/customers/customers.controller.ts:36-38`
- **Fix**: bypass por header `x-dev-bypass` ou aumentar limit em NODE_ENV=development

## Nota técnica
**idb ui text requer precise prior ui tap em WebView input** (mesma limitação do sub 7). No welcome screen 440×956 logical pts, nome input y≈440, CPF input y≈540. Sem focus, texto vai pra Safari URL bar (y=888). Hardware keyboard disabled (`ConnectHardwareKeyboard=0`), HID typing through sim.

## DB cross-check
Orders criados durante run (truncated):
| id | status | total_cents | billing_mode | visit_id |
|---|---|---|---|---|
| 54dd5a3b... | created* | 7890 | individual | 61e4f693... |
| 4fcfb1e2... | received | 4980 | individual | 61e4f693... |
| 023568ac... | created* | 7890 | individual | 2b9af947... |

*Reverted from delivered per task cleanup.

`order_items` mostram `customer_id=NULL` em todos exceto um (4fcfb1e2 pegou cookie antes da rotação) — **isso confirma Bug 2**.

## WS order:created verification
Backend emission verified em `apps/api/src/modules/orders/orders.service.ts:296-305`. FE subscription via `useTableSocket` em `apps/web-customer/src/hooks/useTableSocket.ts:63`. Consumed por /pedido (`apps/web-customer/src/app/[slug]/pedido/page.tsx:112-116`) e /pedido/mesa pra refetch. **/assistente NÃO subscribes order:created** — usa continuation API on GET /home.

## Cleanup
```sql
UPDATE orders SET status='created' WHERE status='delivered' AND customer_id=(SELECT id FROM customers WHERE cpf='12345678909'); -- UPDATE 2
```
**Nota**: source-of-truth status name é `received`, NÃO `created`. Cleanup como specified no task brief produz status que pode não match `OrderStatus` enum.

Tempo: ~42min (256681 tokens, 300 tool uses · idb stateless)
