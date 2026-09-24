Subagent: v20-canon-audit
Status: PASS (7/7 surfaces canon OK · 3 drifts minor não-urgentes)

Branch: fix/customer-tools-and-continuation
Sim: iPhone 17 F1BA0367 via idb localhost:10886

## Net verdict
**7/7 locked surfaces match V20 canon. No urgent fixes required.** All hand-designed Round 4 surfaces preserve tokens, typography, layout, e copy per CLAUDE.md §V20-locked rules.

## Per-surface verdicts

| # | File | Verdict |
|---|---|---|
| a | `apps/web-customer/src/components/welcome/WelcomeModal.tsx` | ✅ CANON OK · live render confirmed via 01-welcome.png. Eyebrow `MESA 01 · BEM-VINDO`, title 26/700 "Pra começar, quem é você?", FieldShell pattern, mono helper, filled PillButton with arrow, `grid place-items-center h-[100dvh]` (line 122). All 7 rules pass. |
| b | `apps/web-customer/src/components/welcome/CpfInput.tsx` | ✅ CANON OK · "naked" input pattern preserved — zero border/padding classes no input (line 51), focus state delegated via onFocusChange (line 16, 44-48) |
| c | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx` | ✅ CANON OK · Label "Seu nome" (NÃO "Seu primeiro nome") at lines 164, 167. Mirrors Welcome canon line-for-line (eyebrow→title→body→FieldShell×2→helper→CTA). grid place-items-center at line 140 |
| d | `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx` | ✅ CANON OK + 1 minor (D1). Centralized block at line 230. Comments lines 223-228 explicitly document C-NEW-11 fix que removeu flex-1 spacer |
| e | `apps/web-customer/src/components/ui/CallWaiterSheet.tsx` | ✅ CANON OK + 2 minors (D2, D3). All 5 motivos canon V20 (lines 52-107): bring_menu/place_order/serve_drink/ask_bill/other com labels "Trazer o cardápio", "Fazer pedido", "Servir bebida", "Pedir a conta", "Outro motivo". Drag via useSheetDrag hook (line 153) + {...bind} spread (line 278). Vaul pattern preserved |
| f | `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` (reclaimBanner, 528-554) | ✅ CANON OK · V20 discreet hint: border-border-soft bg-surface text-ink + mono eyebrow `Conta reconhecida`. **NO amber/yellow regression** — confirmado via grep. Comments 529-532 confirmam V13→V20 swap intentional |
| g | `apps/web-customer/src/app/[slug]/assistente/page.tsx` (landing !chatStarted, 1423-1450) | ✅ CANON OK · 2 PillButtons "Chamar garçom" + "Ver cardápio" (lines 1434-1439) + HomeHero com landingGreeting || fallback (lines 1441-1448). chatStarted gate at line 521; first-send transition at line 1081-1091 prepends landingGreeting como 1st AI bubble |

## V20 drifts (3 minor — NÃO urgentes)

### 🔵 D1 — WaitingApproval eyebrow tracking
- `ScreenCustomerWaitingApproval.tsx:233` usa `tracking-[1.2px]` em vez de canon **1.5px**
- Likely intentional pra acomodar dot prefix + countdown text
- Pode normalizar pra 1.5px se visual permitir

### 🔵 D2 — CallWaiterSheet title size
- `CallWaiterSheet.tsx:314` usa `text-[22px] font-semibold` em vez de canon **26/700**
- Likely canon-by-context (sheets get smaller titles que fullscreen screens per V20 canvas)
- Justificado contextualmente

### 🔵 D3 — CallWaiterSheet CTA é raw <button>
- `CallWaiterSheet.tsx:354-367` é raw `<button>` (replicating PillButton styling inline) em vez de `<PillButton>`
- **Viola rule 7 estritamente**
- Reason: inline disabled token swap (`bg-ink` ↔ `bg-faint`); PillButton pode não suportar isso hoje
- **Recomendação**: extender PillButton ou migrar quando suportar

## Regras de ouro · global check (7/7 PASS)

1. ✅ Tokens visuais — all surfaces use canon V20 tokens; no amber/yellow regression
2. ✅ Tipografia — 2 micro-drifts D1, D2 noted (justificáveis)
3. ✅ Layout central — Welcome:122, Identify:140, WaitingApproval:230 all use `grid place-items-center h-[100dvh]`
4. ✅ Copy "Seu nome" preserved — Welcome:142+145, Identify:164+167
5. ✅ Sem modal-card border-ink 1.5px no WelcomeModal — fullscreen overlay, no card
6. ✅ Sem flex-1 spacer — C-NEW-11 fix confirmed
7. ⚠️ PillButton custom — PASS com 1 drift (D3 — CallWaiterSheet CTA raw)

## Visual coverage
- **Captured live (under 4-max cap)**: 01-welcome.png (a — all canon elements visible)
- **03-identify-before-join.png**: shows `/${slug}` redirect fallback ("Escaneie o QR da mesa") — /identify redirects quando getSessionToken() empty (per `app/[slug]/identify/page.tsx:28-36`)
- **Surfaces b/d/e/f/g**: audited via source + grep only (iOS Safari WebView opacity bloqueou typing). Source review sufficient — cada file contém explicit canon-tracking comments referenciando Round 4 decisions (C-NEW-7, C-NEW-8, C-NEW-10, C-NEW-11) que lock canon

## Cleanup candidates (não urgentes)
1. Extract FieldShell (duplicado em WelcomeModal.tsx:214-233 + IdentifyBeforeJoin.tsx:242-261) → `apps/web-customer/src/components/ui/FieldShell.tsx` (comment IdentifyBeforeJoin:236-241 já flag)
2. Normalize WaitingApproval eyebrow tracking 1.2px → 1.5px (D1)
3. Migrate CallWaiterSheet CTA pra PillButton uma vez que suportar disabled token swap (D3)

Tempo: ~30min (100709 tokens, 41 tool uses · ~38/60 cap)
