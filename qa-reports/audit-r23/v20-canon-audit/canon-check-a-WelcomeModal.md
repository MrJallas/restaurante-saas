# canon-check (a) — WelcomeModal

**File:** `apps/web-customer/src/components/welcome/WelcomeModal.tsx` (lines 1-234)
**Mounted at:** `/[slug]/mesa/[tableCode]` page when `pageState === 'welcome'`
**Visual evidence:** `screenshots/01-welcome.png` (live render on iPhone 17 sim)

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Mono eyebrow `MESA N · BEM-VINDO` | line 102: `eyebrow = (tableLabel ? '${tableLabel.toUpperCase()} · ' : '') + 'BEM-VINDO'`; line 124-126 mono 10px tracking-[1.5px] text-faint | OK — sim render shows `MESA 01 · BEM-VINDO` |
| Title 26/700 "Pra começar, quem é você?" | line 128-133: `text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink` + literal copy | OK — render confirms |
| FieldShell pattern (label mono + container border outline + shell controls border on focus) | lines 214-233 (FieldShell component, `border-[1.6px]` + `border-ink` vs `border-border-soft`) | OK — both inputs wrapped, shell pattern intact |
| Helper mono uppercase under CPF | line 168-170: `font-mono text-[10px] font-bold uppercase ... text-faint` "Só pra mesa saber quem é · CPF nos ajuda…" | OK — render confirms mono caps |
| PillButton filled fullWidth with seta `→` | line 181-193: `<PillButton variant="filled" fullWidth ...>` content `Continuar` + `<span aria-hidden>→</span>` | OK — render shows filled CTA with arrow |
| `grid place-items-center` em `h-[100dvh]` | line 122: `relative grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8` | OK — eyebrow→form→CTA stays as single block in viewport center |
| Inputs "Seu nome" / "Seu CPF" labels (NOT "Seu primeiro nome") | line 142: `<FieldShell label="Seu nome" ...>`; line 159: `<FieldShell label="Seu CPF" ...>` | OK |

## Tokens used (must be V20 canon)

- `text-ink` (line 130, 136, 155, 219, 226, 326) — OK
- `text-mute` (line 135, 219) — OK
- `text-faint` (line 124, 168, 155 placeholder) — OK
- `border-soft` via `border-border-soft` (line 226) — OK
- `bg-bg` (line 106, 225) — OK
- No `bg-surface` here (used for shell idle bg — actually `bg-bg` per line 225). Spec didn't require `bg-surface` for the input; design uses `bg-bg`. **Not a drift** — CLAUDE.md regra 1 lists `bg-surface` as a sanctioned token, not as required here.

## Typography conformance

- Eyebrow: `font-mono text-[10px] tracking-[1.5px]` (line 124) — canon
- Title: `text-[26px] font-bold tracking-[-0.024em]` (line 130) — canon (26/700 tracking -0.024)
- Body 15/500: `text-[15px] font-medium leading-[1.5]` (line 135) — canon

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — no swaps detected. **PASS**
2. Tipografia — eyebrow 10/mono/1.5px, title 26/700/-0.024em, body 15/500. **PASS**
3. Layout `grid place-items-center` em `h-[100dvh]` — line 122. **PASS**
4. Copy "Seu nome" (não "Seu primeiro nome") — line 142, 145. **PASS**
5. Sem modal-card `border-ink 1.5px` — fullscreen overlay (line 106 `fixed inset-0 z-50 bg-bg`), shell border é `border-[1.6px]` apenas no input wrapper, não no card. **PASS**
6. Sem `flex-1` spacer — line 122 usa `grid place-items-center` (no flex-1). **PASS**
7. PillButton custom usado (line 181), não `<button>` raw. **PASS**

## Drifts

**None detected.** Source matches canon spec line-for-line and the live render matches the source.

## Observations (informational, not drifts)

- Line 135 body `<p>` uses `max-w-[320px]` — keeps copy from running full container width. Intentional (V20 readable measure).
- Line 168 helper has `tracking-[0.8px]` (not 1.5px like the top eyebrow). Spec says "mono uppercase" but not the exact tracking; 0.8px is the V20 sub-helper tracking pattern.
- Local `FieldShell` component (line 214-233) is duplicated identically in `ScreenCustomerIdentifyBeforeJoin.tsx` (line 242-261). Comment in IdentifyBeforeJoin (line 236-241) acknowledges this and recommends future extraction to `components/ui/FieldShell.tsx`. Cleanup candidate, not a canon drift.
