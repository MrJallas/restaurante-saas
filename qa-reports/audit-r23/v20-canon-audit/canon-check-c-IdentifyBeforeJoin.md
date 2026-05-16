# canon-check (c) — ScreenCustomerIdentifyBeforeJoin

**File:** `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx` (lines 1-261)
**Mounted at:** `/[slug]/identify` (page at `apps/web-customer/src/app/[slug]/identify/page.tsx`)
**Visual evidence:** Could not capture isolated render — the `/identify` page redirects to `/${slug}` if `getSessionToken()` is missing (line 28-36 of `identify/page.tsx`), and seeding session state via simulator WebView typing was blocked by iOS WebView opacity to idb. Source review only — but Welcome (canon-check-a) confirms FieldShell pattern identically with live render.

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Mesmo canon do WelcomeModal | Lines 142-227 mirror the structure: eyebrow→title→body→FieldShell×2→helper→error→CTA | OK |
| Label "Seu nome" (não "Seu primeiro nome") | line 164: `<FieldShell label="Seu nome" focused={nameFocused}>`; line 167 placeholder also `Seu nome` | OK |
| Mono eyebrow | line 142-144: `font-mono text-[10px] uppercase tracking-[1.5px] text-faint` — copy "Acabou de escanear · alguém já está nesta mesa" | OK |
| Title 26/700 -0.024em | line 146-148: `text-[26px] font-bold leading-[1.15] tracking-[-0.024em] text-ink` — copy "Quem é você?" | OK |
| Body 15/500 mute | line 150-161: `text-[15px] font-medium leading-[1.5] tracking-[-0.005em] text-mute` | OK |
| Helper mono uppercase | line 190-193: `font-mono text-[10px] font-bold uppercase ... text-faint` — same copy as Welcome | OK |
| PillButton filled fullWidth com seta | line 211-222: `<PillButton variant="filled" fullWidth ...>` `{submitting ? 'Validando…' : 'Continuar'}` + arrow span | OK |
| `grid place-items-center` em `h-[100dvh]` | line 140: `relative grid h-[100dvh] min-h-dvh w-full place-items-center px-[22px] py-8` — idêntico ao WelcomeModal | OK |
| FieldShell wraps name + CPF inputs com focus tracking | lines 164-188: `nameFocused`/`cpfFocused` state, FieldShell forwards focus state via shell border | OK |

## Tokens used

- `text-ink`, `text-mute`, `text-faint`, `border-soft` (via `border-border-soft`), `bg-bg`, `bg-surface` (line 205 returningName confirmation card) — todos canon V20
- `text-danger` no error alert (line 198) — canon error token
- `text-success` não usado aqui (apropriado — esta tela não tem estado approved)

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — sem swaps. **PASS**
2. Tipografia — title 26/700, body 15/500, eyebrow 10/mono/1.5px. **PASS**
3. Layout `grid place-items-center` em `h-[100dvh]` — line 140. **PASS**
4. Copy "Seu nome" (não "Seu primeiro nome") — line 164, 167. **PASS** — esta é a regra crítica explicitamente listada
5. Sem modal-card border-ink 1.5px — esta tela é uma `<main>` fullscreen, sem overlay/modal. **PASS**
6. Sem `flex-1` spacer — `grid place-items-center` agrupa tudo no centro. **PASS**
7. PillButton custom usado (line 211). **PASS**

## Drifts

**None detected.** Source matches Welcome canon line-for-line; only differences are copy (eyebrow/title/body) e o `returningName` confirmation card (intencional — exclusivo deste flow).

## Observations

- Local `FieldShell` (line 242-261) é **byte-identical** ao FieldShell do WelcomeModal.tsx. Comment line 236-241 ack the duplication e marca como cleanup candidate ("extrair pra `components/ui/FieldShell.tsx` num PR de cleanup"). Não é canon drift — só DRY-violation aguardando refactor.
- `returningName` card (line 205-209) usa tokens canon (`border-border-soft bg-surface text-ink`) — não introduz tokens novos.
