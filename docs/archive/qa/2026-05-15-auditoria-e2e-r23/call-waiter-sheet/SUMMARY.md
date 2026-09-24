Subagent: call-waiter-sheet
Status: PASS (6/7 ✅ · 1/7 N/A · 0/7 FAIL)

Device: iPhone 17e (iOS 26.5) UDID 97E08813-F71A-4AA9-9EBA-D6BB22601867 via idb localhost:10884
Branch: fix/customer-tools-and-continuation (PR #63 drag v3)
Locked file: apps/web-customer/src/components/ui/CallWaiterSheet.tsx (V20)

## 7 cenários

| # | Cenário | Status |
|---|---|---|
| a | Tap "Chamar garçom" → sheet sobe com 5 motivos canon | ✅ |
| b | Tap "Trazer o cardápio" → Confirmar → DB row + Aguardando inline | ✅ |
| c | Drag-dismiss 5× consecutivos · backdrop NÃO preso | ✅ |
| d | Active call poll → reabre direto em "Aguardando" view | ✅ |
| e | Cancel via SQL → wait 6s → revert para 5 motivos | ✅ |
| f | Esc fecha (keyboard) | ⚠️ N/A — sim sem teclado físico BT não dispatcha keydown; listener no código está correto (CallWaiterSheet.tsx:199-207) |
| g | Tap backdrop → fecha | ✅ |

## 5 motivos canon V20 confirmados via accessibility tree

| # | Label literal | Sub literal |
|---|---|---|
| 1 | **Trazer o cardápio** | Versão impressa pra mesa |
| 2 | **Fazer pedido** | Garçom anota direto |
| 3 | **Servir bebida** | Reabastecer ou vinho na taça |
| 4 | **Pedir a conta** | Iniciar fechamento |
| 5 | **Outro motivo** | Você descreve quando atender |

Note: spec da audit tinha texto ligeiramente diferente ("Trazer cardápio", "Pedir conta") — implementação real usa "Trazer **o** cardápio" e "Pedir **a** conta". Não é regressão, é o canon.

Layout: handle 40×4 (visual) sobre área grab 36pt · sheet ocupa y=210→725 = 61% da viewport (dentro de max-h-[78dvh]).

## DB cross-check
Conexão `docker exec -i restaurant-postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas`.

- Cenário b: criou row `240c53dd-... | bring_menu | pending`
- Cenário d INSERT: `8e62164f-... | other | pending` vinculado a table_session ativa
- Cenário e UPDATE: status='cancelled' WHERE status='pending' (UPDATE 1)
- Cleanup: DELETE removeu 1 row `other`; restante: 30 cancelled (nenhum pending órfão)

Customer: 21a81205-4adf-41e3-86b5-baa8d3e339fb (Caleb Teste, CPF 12345678909)
Table M01 secret: 5e4cf4c2-58e9-44fe-a0c0-e3aa7a9f53eb

## Bugs novos / Achados

### 🆕 P3 (deploy/dev workflow) — API container hot-reload flake
- Rota `/waiter-calls/active` não estava registrada no container API
- `apps/api/dist/modules/waiter-calls/waiter-calls.controller.js` rebuiltado 19:00 mas container up desde 18:15 e nest --watch não picked up addition
- Sintoma: `invalid input syntax for type uuid: "active"` (caía no handler `getCall(callId="active")`)
- **Fix manual**: `docker restart restaurant-api` re-mapeou rota
- Source code correto (controller `@Get('pending')` L90 → `@Get('active')` L101 → `@Get(':callId')` L111)
- **NÃO é bug de código** — é flake de hot-reload (vale documentar pra dev workflow)

### ⚠️ COMPORTAMENTO (não bug)
- Spec pedia "navega /garcom/chamando" após confirm. Implementação atual (V20 round 21) mostra `ScreenCustomerWaiterCallWaiting` **INLINE na própria sheet** quando status=pending. Só faz router.push('/garcom/chamando') se resposta vier com status cancelled/resolved (fallback). Comportamento esperado per CallWaiterSheet.tsx:219-235.

## V20 canon · 100% preservado

- Tokens: text-ink/mute/faint, border-soft, bg-surface/bg-bg ✅
- Typography: mono eyebrow 10/uppercase/tracking-1.5px, title 22/600/tracking-[-0.02em], body 13-14.5 ✅
- CTA: bg-ink text-white filled com seta → canon ✅
- Handle 40×4 com bg-border-soft opacity-60 ✅
- max-h-[78dvh] ✅
- backdrop bg-black/[0.32] ✅
- rounded-t-[22px] border-[1.5px] border-ink ✅

## V20 drifts
- Nenhum drift visual confirmado

Tempo: ~18.1min
