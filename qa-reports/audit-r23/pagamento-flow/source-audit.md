# Source audit — Pagamento flow

Method: source-code read + grep. No idb / no screenshots.

## Frontend routes & handlers

### 1. `apps/web-customer/src/app/[slug]/pagamento/page.tsx` — entrypoint
- **Loading**: parallel `apiGet` to `/orders/bill?mode=table` and (if visitId) `/orders/bill?mode=individual&visitId=...`
- **State**: `mode: 'table' | 'individual'`, `method: 'pix' | 'credit' | 'debit'`, `submitting`
- **CTA "Gerar QR Code Pix"** (line 286–297) `handleProceed` posts `/payments` with `{mode, visitId?, method}`. On success, navega `push('/pagamento/pix?paymentId=...')`. On `method !== 'pix'` redirects to `/pagamento/erro?reason=method_unavailable`. On catch redirects to `/pagamento/erro?reason=gateway`.
- **Trio canon**: na verdade são **3 method options** (pix / credit / debit, linhas 40–44) selecionáveis + 1 dashed button **"Dividir conta"** (linha 277–282). Não é trio de PillButtons grandes — é cardlist + secondary CTA. Mode toggle (table/individual) só aparece quando `individualBill` existe.
- **Empty state** (linha 156–183) — se `bill.totalCents <= 0` exibe "Nada a pagar ainda" com CTA pra cardápio.

### 2. `apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx` — QR + timer
- **Polling**: `setInterval(load, 4000)` linha 62. Cada tick faz `apiGet('/payments/${paymentId}')`.
- **Redirect logic** linhas 52–56:
  - `status === 'confirmed'` → `router.replace('/pagamento/feedback')`
  - `status === 'failed' | 'expired'` → `router.replace('/pagamento/erro?reason=${status}')`
- **QR**: `<QRPattern seedString={paymentId} />` linha 162 — gerador deterministic baseado em UUID, não real Pix QR (psp não integrado).
- **Timer**: `formatCountdown` linha 22 mostra `mm:ss`. Recalcula via segundo `setInterval(setNow, 1000)` linha 70. Source value vem de `payment.expiresAt`.
- **Copy-paste**: linha 81 `handleCopy` usa `navigator.clipboard` com fallback de `execCommand('copy')` pra HTTP/Safari.
- **Cancel CTA**: linha 120 `handleCancel` faz PATCH `/payments/${id}/cancel`, depois `router.back()` ou `/pagamento` fallback se history vazio.

### 3. `apps/web-customer/src/app/[slug]/pagamento/dividir/page.tsx` — split
- **Mode toggle** linhas 189–211: 3 chips **igual / por_item / customizado** ✓
- **Computação client-side**:
  - `equal` (linha 95): `(subtotal+service)/N`
  - `by_item` (linhas 99–120): groupBy `it.customerId`, items sem dono são `shared` rateados igual
  - `custom` (não tem branch local — só seta `mode` mas allocations não populam)
- **2 CTAs**: "Enviar resumo" (POST `/payments/bill/split/notify`) + "Pagar (minha parte)" (POST `/payments` com `splitMode + allocations`).
- **Per-pessoa render** linhas 264–293 mostra cada participante com avatar, nome, `base + taxa 10%`, total.

### 4. `apps/web-customer/src/app/[slug]/pagamento/feedback/page.tsx` — pós-confirm
- 5 stars (linhas 98–117), 5 tags chip (linhas 122–139), textarea opcional, POST `/feedbacks`.
- **Continuation hint**: linha 26 `recordContinuationHint('pagou')` — feedback marca cookie pra greeting do assistente.
- Após submit: tela "Obrigado!" + `setTimeout(() => push('/cardapio'), 1600)`.

### 5. `apps/web-customer/src/app/[slug]/pagamento/erro/page.tsx` — fallback erro
- **4 reason codes** (linhas 12–37): `expired/E-104`, `failed/E-102`, `method_unavailable/E-210`, `gateway/E-500`. Fallback default → `failed`.
- **Mostra**: ícone vermelho `!`, eyebrow danger "PAGAMENTO NÃO AUTORIZADO", title, body, detalhes (código/horário/valor/mesa), motivo provável, 3 alternativas (crédito/débito/garçom-sheet), CTAs "Voltar" + "Tentar Pix novamente".

## Backend routes

### `apps/api/src/modules/payments/payments.controller.ts`
Prefix: `:slug/payments`. All guarded by `SessionGuard`.

| Verb | Path | Handler | Body |
|---|---|---|---|
| POST | `/` | `requestPayment` | `{mode, visitId?, method, splitMode?, allocations?}` |
| POST | `/:paymentId/confirm` | `confirmPayment` | `{pspTransactionId?}` |
| PATCH | `/:paymentId/cancel` | `cancelPayment` | – |
| POST | `/bill/split/compute` | `computeSplit` | `{mode, participants[], allocations?}` |
| POST | `/bill/split/notify` | `notifySplit` | `{mode, allocations[]}` |
| GET | `/` | `getSessionPayments` | – |
| GET | `/:paymentId` | `getPaymentStatus` | – |

### `apps/api/src/modules/payments/payments.service.ts`
- **PIX_EXPIRY_SECONDS = 600** (10min) linha 11 ✓
- **status normalization** linha 32: `paid → confirmed` alias para legacy rows ✓
- **Concurrency safety**: SETNX lock `payment_lock:${tableSessionId}:${visitId|'table'}` antes de SELECT-then-INSERT pra fechar TOCTOU. Comentário diz "antes 2 POSTs concorrentes ambos viam `existing=[]` e ambos INSERTavam → 2 Pix com QRs diferentes, PSP webhook batia em ambos = double charge" ✓ (Round 11 fix).
- **Lazy expiry**: linha 376–386 tanto em `getPaymentStatus` quanto em `confirmPayment` (linhas 287–298) — pending payment com expires_at no passado transiciona pra `expired` no próximo poll, sem cron ✓
- **Ownership filter**: tanto `confirmPayment` (linha 270) quanto `getPaymentStatus` (linha 350) filtram por `table_session_id` — comentário cita P1 bug-hunt: "qualquer cliente com o UUID podia ler QR Code Pix" ✓
- **Pix code só pra method='pix'**: linha 189–193 evita vazar pixQrCode em response de cartão (P2-D-3 fix) ✓
- **computeSplit**: server-side math autoritativo (linha 448–531). `equal` (floor + remainder no idx 0), `by_item` (groupBy customer_id + shared rateado), `custom` (validador `Math.abs(sum-total) > N`) — cap `Max(10_000_000)` cents para prevenir overflow do bound-check (linha 38).

## AI tools (router-style)

| Tool | File | Router target | Status |
|---|---|---|---|
| `open_payment_screen` | services/ai-service/services/tools/open_payment_screen.py | ScreenCustomerPayment | `not_implemented` |
| `pay_full` | .../pay_full.py | ScreenCustomerPayFull | `not_implemented` |
| `pay_individual` | .../pay_individual.py | ScreenCustomerPayIndividual | `not_implemented` |
| `split_bill` | .../split_bill.py | ScreenCustomerSplitBill | `not_implemented` |

Todos 4 são **router-only** (FE recebe `router_target`, action_payload `{status:'not_implemented'}`). Não fazem POST `/payments` direto — só sinalizam ao FE pra abrir a respectiva screen. Cada um retorna `chips[]` (3 sugestões). Registry confirmado em `services/ai-service/services/tools/__init__.py`.
