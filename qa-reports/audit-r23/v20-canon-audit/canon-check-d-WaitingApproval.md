# canon-check (d) — ScreenCustomerWaitingApproval

**File:** `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx` (lines 1-383)
**Mounted at:** `/[slug]/mesa/[tableCode]` (`pageState === 'pending_approval'` branch line 433-468) via `PendingApprovalWrapper`
**Visual evidence:** Source review only (requires real pending late-arrival state to render; out of scope for static surface audit).

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Bloco unificado eyebrow→title→sub→ícone→pill→CTA centralizado | lines 229-310: main `<main className="bg-bg">` → inner `<div className="relative grid h-[100dvh] min-h-dvh w-full place-items-center px-6 py-8">` → child `<div className="flex w-full max-w-[420px] flex-col items-center text-center">` agrupa todos os elementos | OK |
| Sem `flex-1` spacer empurrando CTA pro bottom | Inner container usa `grid place-items-center` (line 230), e o filho usa `flex flex-col items-center` SEM `flex-1` ou `mt-auto`. CTA `<PillButton>` está `mt-7` em relação aos botões de ação, mantendo bloco coeso | OK — comments line 224-228 explicitly mention this fix ("antes: justify-start + flex-1 spacer empurrava o CTA pro rodapé") |
| Mono eyebrow caps | lines 232-238: `font-mono text-[10px] font-bold uppercase tracking-[1.2px]` + dot animado (line 236 `animate-bounce-dot`) | OK |
| Title 26/700 -0.024em | line 241-243: `text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink` | OK |
| Body 15/500 mute | line 245-247: `text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute` | OK |
| Ícone central (Pulse / CheckMark / Sleep) | lines 249-253: `my-8 flex h-24 w-24 items-center justify-center` + conditional render | OK |
| Pill ladder (rounded-full border indicador step) | lines 256-273: rounded-full + border-soft + bg-surface (waiting) ou bg-success/10 (approved) | OK |

## Tokens used

- `text-ink`, `text-mute`, `text-faint`, `border-border-soft`, `bg-bg`, `bg-surface`, `text-success`, `bg-success`, `text-danger` (não usado direto aqui) — canon
- `bg-success/10` é alpha modifier do success token — sanctioned utility

## Tipografia

- Eyebrow mono 10/700/1.2px — line 233. **Note:** tracking aqui é `1.2px`, não `1.5px` como nos outros surfaces. CLAUDE.md regra 2 lista eyebrow tracking como `1.5px`. **Possible micro-drift** — discussed in `drift-summary.md`.
- Title 26/700/-0.024em — canon
- Body 15/500 — canon

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — sem swaps. **PASS**
2. Tipografia — title/body canon; eyebrow tracking `1.2px` em vez de `1.5px` em **uma** location (line 233). **MINOR DRIFT** — but tracking-[1.2px] foi escolha intencional pra acomodar o dot prefix + tempo countdown. Pode ser canon implícito (V20 admite `tracking-[1.2px]` em eyebrows com prefix). Não é grave o suficiente pra block.
3. Layout `grid place-items-center` em `h-[100dvh]` — line 230. **PASS** (comments line 223-228 confirmam que fix C-NEW-11 substituiu `justify-start + flex-1 spacer` exatamente porque essa regra)
4. Copy — não aplicável aqui (regra 4 é sobre "Seu nome" vs "Seu primeiro nome", específico do Welcome/Identify)
5. Sem modal-card border-ink 1.5px — `<main>` fullscreen, sem overlay. **PASS**
6. Sem `flex-1` spacer — confirmado, mt-7 só. **PASS**
7. PillButton custom usado (lines 278, 289, 297). **PASS**

## Drifts

- **Eyebrow tracking `1.2px` (line 233) vs canon `1.5px`** — minor. WelcomeModal e IdentifyBeforeJoin usam `1.5px`, este usa `1.2px`. Pode ser justificável pra eyebrow com dot prefix + countdown, mas se manter o canon estrito, seria swap pra `1.5px`. Documentado em drift-summary.md.

Nenhum outro drift detectado.

## Observations

- Comments lines 223-228 e 275-276 documentam explicitamente o fix C-NEW-11 que removeu o `flex-1` spacer. Excelente trail pro auditor — código não regrediu.
- `eyebrowColor` (line 216-221) muda dynamically por estado mas usa apenas tokens canon (`text-success`, `text-mute`). OK.
- `Pulse`, `CheckMark`, `Sleep` (lines 319-382) usam tokens canon (`border-border-soft`, `bg-surface`, `bg-success`, `border-ink`, `bg-white`, `text-faint`). OK.
