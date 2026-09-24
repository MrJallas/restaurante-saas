Subagent: pagamento-flow
Status: PASS (6/7 ✅ · 1 PARCIAL divergência cosmetic · 0 bugs críticos · safety guards confirmados)

Branch: fix/customer-tools-and-continuation
Customer: Caleb Teste CPF 12345678909 customerId=21a81205-4adf-41e3-86b5-baa8d3e339fb
Método: source-code audit + curl + docker psql (sem screenshots/idb)

## Verdict global
**PAGAMENTO FLOW SAUDÁVEL** com 1 divergência cosmetic + 1 modo de split inacabado.

## Cenários

| # | Cenário | Verdict |
|---|---|---|
| a | /pagamento "trio canon"? | ❌ PARCIAL — é review-bill com 3 radio methods + 1 CTA + 1 dashed split (não trio PillButton) |
| b | /pix exibe QR + chave + timer 10min? | ✅ OK |
| c | Polling pending→confirmed→/feedback? | ✅ OK (4s interval, 3 transitions tratadas) |
| d | /dividir per-pessoa OR per-item? | ✅ OK (3 modes: equal/by_item/custom) |
| e | /erro com error_code? | ✅ OK (4 codes: E-102/104/210/500) |
| f | AI tools pay_full/individual/split_bill? | ✅ OK (4 router-style tools, not_implemented) |
| g | Table-shared session isolation? | ✅ OK (filter table_session_id + SessionGuard) |

## Strong points (safety guards confirmados)
- **Concurrency safety**: SETNX lock `payment_lock:{sessionId}:{visitId}` antes do SELECT-then-INSERT (Round 11 B-NEW-42 fix pra double-charge race)
  - `apps/api/src/modules/payments/payments.service.ts:107-117`
- **Ownership isolation**: defense-in-depth (SessionGuard 401 + service `WHERE table_session_id=$N`)
  - Confirmado via curl T9 que bateu 401 com sessão alheia
- **Lazy expiry**: pending com `expires_at < now()` transiciona pra `expired` no GET — sem cron
  - `service.ts:376-386`
- **Pix payload nullable em method != pix** (P2-D-3 fix, linha 189-193)
- **DTO validation**: `Max(10_000_000)` cents anti-overflow, `ArrayMaxSize(50)` anti-DoS
- **Server-side split math** autoritative com bound-check `Math.abs(sum-total) > N`

## Bugs novos / Achados

### 🟡 P2 — Entrypoint /pagamento não é "trio PillButton" V20 canon
- Atual: review-bill screen com radio method cards (PIX/crédito/débito) + 1 CTA primário "Gerar QR Code Pix" + 1 dashed secondary "Dividir conta com outras pessoas"
- Spec original mencionava "trio canon (PIX, dividir, total)" — provável referência a 3 PillButtons grandes
- Divergência visual com V20 canon (se "trio" = 3 PillButtons)
- Se "trio" refere-se aos 3 method radios, OK
- **Recomendação**: confirmar com design canvas V20 se layout atual está correto

### 🟡 P2 — `custom` split mode incompleto
- Chip existe em `dividir/page.tsx:189-211`
- `useEffect` linha 92 só popula allocations para `equal` e `by_item`
- CTA "Pagar" fica disabled com `mineAmount=0`
- Não implementado totalmente

### 🔵 P3 — PSP não integrado
- Confirmação via POST /confirm é dev-only (controller linha 127-134 comenta explicitamente)
- Pix payload é sintético
- Onda 4 / integração futura

### 🔵 P3 — mode=table edge case
- Orders existentes têm billing_mode='individual'
- POST /payments com mode='table' rejeita "Nenhum valor pendente"
- Service só somma orders billing_mode='table'
- Frontend trata via empty state, mas mesa mista não testada

## API endpoints exercitados (curl)
```
POST  /payments                       ✅ pending criado (mode=individual)
GET   /payments                       ✅ lista da sessão
GET   /payments/:id                   ✅ status + pix code
POST  /payments/:id/confirm           ✅ pending → confirmed
PATCH /payments/:id/cancel            ✅ pending → cancelled
POST  /payments/bill/split/compute    ✅ allocations
GET   /orders/bill?mode=table         ✅ bill com items
```
**Auth quirk**: apenas `Cookie: session_token=<uuid>` funciona — `x-session-token` header NÃO funciona.

## DB cross-check (docker psql 5434)
- Tabela `payments` tem 17 cols — **NÃO tem customer_id direto** (usa visit_id → visits → customer_id)
- 3 status terminais: confirmed, cancelled, expired (+ alias paid→confirmed no read)
- Audit-fresh transitions verified em DB:
  - 5fad9709: pending → confirmed, paid_at populado, psp_transaction_id=NULL
  - b9152fc5: pending → cancelled, cancelled_at populado
  - 4fb32970: pending → expired (lazy)

## AI tools (Python)
Todos 4 registrados em `services/ai-service/services/tools/__init__.py`:
- `open_payment_screen` → router_target ScreenCustomerPayment
- `pay_full` → ScreenCustomerPayFull
- `pay_individual` → ScreenCustomerPayIndividual
- `split_bill` → ScreenCustomerSplitBill

Todos router-only com `action_payload.status = 'not_implemented'` — FE swaps screen, customer aciona flow manual.

Tempo: ~6min (89371 tokens, 48 tool uses)
