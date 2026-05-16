# Scenarios — Pagamento (source + curl + DB cross-check)

Method: source audit + curl direto + queries SQL. SEM screenshots, SEM idb.

## (a) GET `/pagamento` → trio canon? ❌ PARCIAL — não é "trio" PillButton

**Expected**: 3 PillButtons grandes (PIX / dividir / total).

**Observed** ([page.tsx:185–302](apps/web-customer/src/app/[slug]/pagamento/page.tsx)):
- Header "Pagar conta" + label "Mesa M01 · N itens"
- Opcional: mode toggle (Conta da mesa / Minha comanda) — só aparece se `individualBill` existe
- **Bill card** com items + subtotal + taxa 10% + total
- **Forma de pagamento**: 3 cards radio-style (Pix / Cartão de crédito / Cartão de débito) — `METHODS` array linha 40
- **Botão dashed**: "Dividir conta com outras pessoas" (push pra `/pagamento/dividir`)
- **CTA filled**: "Gerar QR Code Pix · R$ X,XX" (ou "Pagar · R$ X,XX" se outro method)

**Verdict**: Não há trio de PillButtons na entrypoint. É um screen de **review-bill + pick-method + proceed**. Único PillButton filled é o CTA "Gerar QR Code Pix". O caminho "split" é um secondary button dashed. Caminho "individual vs total" é o mode toggle (só quando há individualBill).

Se "trio canon" se referir a **PIX / cartão crédito / cartão débito** (radio group), então **OK ✓**.

## (b) `/pagamento/pix` exibe QR + chave + timer 10min? ✓ OK

**Observed** ([pix/page.tsx](apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx)):
- **QR**: `<QRPattern seedString={paymentId} />` linha 162 dentro de container 230×230 com border. Centro overlay "PIX" 44×44 ✓
- **Timer**: linha 169–177 mostra `Código expira em <b>mm:ss</b>` com ponto piscante (`animate-blink`). `expiresAtMs - now`, refresh por `setInterval(setNow, 1000)` ✓
- **Copia-e-cola**: linha 195–213 box com truncated copy-paste + botão "Copiar"/"Copiado" 2s ✓
- **Valor a pagar**: card mostrando `R$ X,XX` + "Sua parte (inclui taxa 10%)" ✓
- **Cancel CTA**: linha 222–226 "Cancelar pagamento" ✓
- **Source value confirmed via curl**: `expiresAt = createdAt + 600s` (PIX_EXPIRY_SECONDS=600 linha 11 service) ✓

## (c) Status polling pending → confirmed → /feedback? ✓ OK

**Observed** ([pix/page.tsx:44–67](apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx)):
```ts
const timer = setInterval(load, 4000);
// dentro de load:
if (data.status === 'confirmed') {
  router.replace(`/${slug}/pagamento/feedback`);
} else if (data.status === 'failed' || data.status === 'expired') {
  router.replace(`/${slug}/pagamento/erro?reason=${data.status}`);
}
```
- Polling a cada **4s** ✓
- 3 transitions tratadas: confirmed→feedback, failed→erro?reason=failed, expired→erro?reason=expired ✓
- **curl T6+T7 confirmado**: criei `5fad9709...`, POST `/confirm`, depois GET retornou `status:'confirmed', paidAt:...` — o polling no FE pegaria isso no próximo tick e navegaria pra `/feedback` ✓

## (d) `/pagamento/dividir` per-pessoa OR per-item? ✓ OK (3 modes na verdade)

**Observed** ([dividir/page.tsx:189–211](apps/web-customer/src/app/[slug]/pagamento/dividir/page.tsx)):
- Mode toggle 3 chips: **Igual / Por item / Customizado** ✓ — não apenas 2
- `equal` (linha 94–98): `(subtotal+service) / participants.length` per pessoa
- `by_item` (linha 99–120): items próprios (`it.customerId`) somam pro dono; items sem dono (`shared`) rateados igual
- `custom` (linha sem branch — só seta mode, allocations não populam local)
- **2 CTAs**: "Enviar resumo" (POST `/payments/bill/split/notify`) + "Pagar R$ X,XX" (POST `/payments` com splitMode + allocations)
- **Server-side split compute** confirmed via curl T11: `mode/totalCents/allocations` retornado corretamente

## (e) `/pagamento/erro` com error_code? ✓ OK (4 reason codes)

**Observed** ([erro/page.tsx:12–37](apps/web-customer/src/app/[slug]/pagamento/erro/page.tsx)):

| reason param | code | title |
|---|---|---|
| `expired` | E-104 | "Algo deu errado com seu Pix" |
| `failed` | E-102 | "Transação recusada" |
| `method_unavailable` | E-210 | "Forma de pagamento indisponível" |
| `gateway` | E-500 | "Problema na comunicação" |

Fallback default: `failed`. Visual: ícone vermelho `!`, eyebrow danger, title 24/600, body, **detalhes** (Código/Horário/Valor/Mesa), **motivo provável** card pink, **3 alternatives** (crédito/débito/garçom-sheet), CTAs **Voltar** + **Tentar Pix novamente**. ✓

## (f) AI tools pay_full / pay_individual / split_bill / open_payment_screen? ✓ OK

Confirmed via grep no registry `services/ai-service/services/tools/__init__.py`:
- `split_bill` → `_split_bill` ✓
- `pay_individual` → `_pay_individual` ✓
- `pay_full` → `_pay_full` ✓
- `open_payment_screen` → `_open_payment_screen` ✓

Todos são **router-style** (FE swaps screen) e marcam `action_payload.status = 'not_implemented'`. Significa que **PSP não está integrado** — os tools só sinalizam navegação, não chamam API direto. O screen abre, e o usuário aciona o flow manual.

Cada tool retorna `chips[]` (3 sugestões cruzadas: pix/cartão/dividir/pay_full). Coverage do mutation-chips test rule não se aplica (read-only tools).

## (g) Table-shared session isolation — filter customer_id no service? ✓ OK

**Observed** ([payments.service.ts](apps/api/src/modules/payments/payments.service.ts)):
- `getPaymentStatus` (linha 350): `WHERE id = $1 AND table_session_id = $2` ✓
- `confirmPayment` (linha 270): `if (payment.table_session_id !== tableSessionId) throw NotFoundException` ✓
- `cancelPayment` (linha 321): mesma checagem ✓
- `getSessionPayments` (linha 410): `WHERE table_session_id = $1` ✓

**Comment cita explicitamente o bug-hunt** (linha 213–214): _"Antes, qualquer cliente autenticado podia ler QR Code Pix e pix_copy_paste de pagamentos de OUTRA mesa adivinhando o UUID (P1 do bug-hunt)"_ — fix applied.

**Curl T9 confirma**: session_token de outra session retorna `401 Sessao expirada` — SessionGuard rejeita antes do service. Defense-in-depth: mesmo se SessionGuard for bypassed, service ainda filtra por `table_session_id`.

**Importante**: o filtro é por **table_session_id**, não por `customer_id`. Isso é correto pra table-shared mesa — todos da mesa veem os payments da mesma sessão. Pra split individual, payments têm `visit_id` distinto, e queries de "minha conta" filtram via `WHERE visit_id = $2` (linha 71, getPaymentStatus retorna tudo da mesa, mas o FE filtra por visitId pra renderização individual).

---

## Achados / discrepancies

1. **(a)** A entrypoint não é "trio PillButton" — é um review-bill screen com **method radio cards** + 1 CTA primário + 1 secondary dashed pra split. Se a expectativa for trio canon, **divergência de design**. Se o trio refere-se a "pix / cartão crédito / cartão débito", confere.
2. **mode=table fallback**: quando todos orders são `billing_mode='individual'`, POST `/payments` com `mode='table'` falha com "Nenhum valor pendente" — service só somma orders com `billing_mode='table'`. Frontend lida via `if (!bill || bill.totalCents <= 0) return EmptyState`. Pode haver bug edge se a mesa tem orders mistos (alguns table, alguns individual) — não testado.
3. **`custom` split mode no FE**: toggle existe mas `useEffect` linha 92 só popula allocations para `equal` e `by_item`. Modo custom precisaria de input manual de allocations no FE — **não implementado** na UI (CTA "Pagar" ficaria com `mineAmount = 0`).
4. **Polling 4s**: razoável pra UX (timer count down de 600s = 150 ticks). Sem websocket — confirmação depende de webhook PSP marcar status, depois polling pega no próximo tick.
5. **PSP não integrado**: pixQrCode é payload sintético (não testado contra banco real). Confirmação manual via POST `/confirm` é dev-only — comentário no controller linha 127–134 cita _"Quando integramos PSP de verdade, o webhook precisa de auth propria"_.

## Status transitions table (DB-verified)

| from | to | trigger | observed in DB |
|---|---|---|---|
| pending | confirmed | POST `/confirm` | ✓ row `5fad9709` |
| pending | cancelled | PATCH `/cancel` | ✓ row `b9152fc5` |
| pending | expired | lazy expiry on GET/confirm | ✓ row `4fb32970` |
