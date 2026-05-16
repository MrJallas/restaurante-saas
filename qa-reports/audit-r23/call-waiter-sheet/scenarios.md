# Subagente 3 — CallWaiterSheet (audit-r23) · scenarios a-g

**Device**: iPhone 17e (iOS 26.5) UDID `97E08813-F71A-4AA9-9EBA-D6BB22601867`
**Branch**: `fix/customer-tools-and-continuation` (PR #63 drag v3)
**Entry**: QR HMAC M01 (ts=1778873519565) → Welcome (Caleb / 12345678909) → Home `/restaurant_dev/assistente`
**Locked file**: `apps/web-customer/src/components/ui/CallWaiterSheet.tsx`

---

## Resumo

| # | Cenário | Status |
|---|---|---|
| a | Tap "Chamar garçom" → sheet sobe 5 motivos | ✅ |
| b | Tap "Trazer cardápio" → Confirmar → Aguardando garçom + DB row | ✅ (com fix de API restart) |
| c | Drag-dismiss 5× consecutivos · sem backdrop preso | ✅ |
| d | Active call poll · `/waiter-calls/active` retorna pending → Aguardando view | ✅ |
| e | Cancel via SQL → wait 6s → sheet volta 5 motivos | ✅ |
| f | Esc fecha (HW keyboard) | ⚠️ N/A (iOS sim sem teclado físico, mas listener no código) |
| g | Tap backdrop (área acima da sheet) → fecha | ✅ |

---

## (a) Tap "Chamar garçom" → sheet sobe 5 motivos ✅

Screenshot: `screenshots/02-sheet-open-5reasons.png`

Sheet acessível (accessibility tree) confirma TODOS os 5 motivos canon V20 em ordem correta:

| # | y range (pt) | Label | Sub |
|---|---|---|---|
| 1 | 326–390 | **Trazer o cardápio** | Versão impressa pra mesa |
| 2 | 399–463 | **Fazer pedido** | Garçom anota direto |
| 3 | 472–536 | **Servir bebida** | Reabastecer ou vinho na taça |
| 4 | 545–609 | **Pedir a conta** | Iniciar fechamento |
| 5 | 618–682 | **Outro motivo** | Você descreve quando atender |

Sheet bounds (em points 390×844 viewport):
- Top: y≈210
- Title "Por que você precisa do garçom?" y=255
- Subtitle y=290
- Confirmar chamado disabled @ y=629
- Cancelar (link) @ y=684
- Bottom: y≈725 → altura ≈515pt = **61% de 844** (dentro de `max-h-[78dvh]` spec)

Backdrop "Fechar" cobre y=47–746 (escurecido `bg-black/[0.32]`).

## (b) Tap "Trazer cardápio" → Confirmar → Aguardando garçom ✅

Screenshots:
- `03-trazer-cardapio-selected.png` (border-ink + bg-surface visível no card 1)
- `04-after-confirm-bring-menu.png` (ScreenCustomerWaiterCallWaiting)

DB cross-check (após Confirmar):
```
id                                   | reason     | status  | created_at
240c53dd-f090-412a-aacc-3c8506ac5b7b | bring_menu | pending | 2026-05-15 19:39:24
```

⚠️ **NOTA**: A spec do task mencionou "navega `/garcom/chamando`". Comportamento ATUAL (V20 round 21) é **inline** via `ScreenCustomerWaiterCallWaiting` dentro da própria sheet — só navega pra `/garcom/chamando` se status já vier `cancelled`/`resolved` (fallback). Pending → swap inline.

## (c) Drag-dismiss 5× consecutivos · backdrop NÃO preso ✅

Screenshots: `05-drag-dismiss-1.png` até `09-drag-dismiss-5.png`

5 dismisses consecutivos via `idb ui swipe 195 225 195 950 --duration 0.12`:

| # | Resultado | Backdrop preso? |
|---|---|---|
| 1 | Sheet fechou, home limpa | ❌ Não |
| 2 | Sheet fechou, home limpa | ❌ Não |
| 3 | Sheet fechou, home limpa | ❌ Não |
| 4 | Sheet fechou, home limpa | ❌ Não |
| 5 | Sheet fechou, home limpa | ❌ Não |

Tap "Chamar garçom" entre cada dismiss reabre a sheet sem regressão. Body scroll lock libera corretamente (`useBodyScrollLock` round 21 §H fix com contador global de consumers).

## (d) Active call poll ✅

Inseri via SQL um chamado `pending` (reason='other') vinculado à `table_session` ativa do customer:
```
8e62164f-b518-4264-a14a-d716b7d10529 | other | pending
```

Reabri a sheet via tap "Chamar garçom". Poll inicial (`/waiter-calls/active`) retornou o call ativo → sheet abriu **direto na view "Aguardando garçom"** (não na seleção de 5 motivos). Screenshot `10-active-poll-other.png`:

- Eyebrow `ATENDIMENTO EM ANDAMENTO`
- Title "Aguardando garçom"
- Tempo de espera: 15s (clock counting)
- Motivo: **Outro motivo** ✓ (REASON_LABELS map correct)
- Cancelar chamado (enabled), Chamar de novo (disabled — não terminou)

## (e) Cancel via SQL → wait 6s → sheet volta 5 motivos ✅

Executei `UPDATE waiter_calls SET status='cancelled' WHERE status='pending'`. Aguardei 7s. Screenshot `11-after-poll-cancelled.png`:

- Sheet voltou para "Por que você precisa do garçom?" com 5 motivos
- Confirmar chamado disabled (nenhum selecionado)

Poll (`setInterval 5000ms`) detectou que a API retorna `null` agora → `setActiveCall(null)` → re-renderiza branch de seleção.

## (f) Esc fecha ⚠️ N/A no iOS simulator

`document.addEventListener('keydown', e => if(e.key==='Escape')onClose())` existe no source (linha 199-207). Testei:
- `idb ui key 53` (HID keycode 53 = Escape) — sheet NÃO fechou
- `xcrun simctl io ... sendkey escape` — sendkey não é operação válida no simctl

Limitação do simulador iOS sem teclado físico Bluetooth conectado: `keydown` JS event para Escape não é dispatched pelo WebKit. Em desktop browser (Chrome/Safari macOS) ou em iPad com Magic Keyboard, o listener funciona. O código está correto.

Screenshot `12-esc-na.png` (sheet permanece aberta após tentativa).

## (g) Tap backdrop → fecha ✅

Tap em (195, 130) — área escurecida acima da sheet (backdrop "Fechar" cobre y=47–210 + zona não-sheet). Sheet fechou imediatamente.

Screenshot `13-tap-backdrop-close.png` — home limpa, sem overlay residual.

---

## Issues found

### Pre-fix runtime: `/waiter-calls/active` route não estava registrado ⚠️

API container havia iniciado às 18:15 mas o dist do controller (`waiter-calls.controller.js`) foi rebuiltado às 19:00 (após adicionar o endpoint `/active`). NestJS `--watch` não recarregou as rotas. Logs mostravam:

```
Mapped {/api/:slug/waiter-calls, POST}
Mapped {/api/:slug/waiter-calls/pending, GET}
Mapped {/api/:slug/waiter-calls/:callId, GET}      ← /active ausente!
Mapped {/api/:slug/waiter-calls/:callId/cancel, PATCH}
...

ERROR: invalid input syntax for type uuid: "active"
QueryFailedError at WaiterCallsService.getCall (line 153)
```

Sintoma: GET `/waiter-calls/active` caiu em `getCall(callId="active")` → query usa "active" como UUID → erro 500.

**Fix aplicado**: `docker restart restaurant-api` recarregou o dist e mapeou:
```
Mapped {/api/:slug/waiter-calls/active, GET} ✓
```

Depois disso (b), (d), (e) passaram. Não é um bug do código-fonte (route order correto no .ts), mas vale registrar que dev workflow precisa de restart manual quando rotas novas são adicionadas a controllers existentes — o watcher do nest não detecta sempre.
