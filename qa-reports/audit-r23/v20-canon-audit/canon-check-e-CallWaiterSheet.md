# canon-check (e) — CallWaiterSheet

**File:** `apps/web-customer/src/components/ui/CallWaiterSheet.tsx` (lines 1-381)
**Mounted at:** Triggered via `openCallWaiterSheet()` from `UIStateProvider` — pode aparecer sobre `/[slug]/mesa/[tableCode]` (home) ou sobre `/[slug]/assistente`.
**Visual evidence:** Source review only (sheet exige user interaction pra abrir; static surface audit não navega WebView pra esse estado em tempo cap).

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Bottom-sheet vaul-style | line 248-380 — `fixed inset-0 z-[60]` overlay + `absolute inset-x-0 bottom-0 z-10 rounded-t-[22px]` sheet | OK |
| 5 motivos canon V20 | lines 52-107 (REASONS array): `bring_menu`, `place_order`, `serve_drink`, `ask_bill`, `other` — exatamente 5 keys | OK |
| Labels canon (Trazer cardápio · Fazer pedido · Servir bebida · Pedir conta · Outro motivo) | line 55: "Trazer o cardápio"; line 66: "Fazer pedido"; line 77: "Servir bebida"; line 88: "Pedir a conta"; line 99: "Outro motivo" | OK — todas as labels canon presentes |
| Drag full-area via pointer events | line 153-156: `useSheetDrag({...})` hook + line 278: `{...bind}` spread no sheet container; line 269-279 sheet container has touch-action handling via the hook | OK — hook-driven drag |
| `touch-action: pan-y` (per CLAUDE.md) | Comment line 282-283 e line 287 `touch-none` no drag handle; comments lines 264-266 explain vaul pattern. The `bind` spread (line 278) delivers the pointer handlers; sheet container's `select-none` + `[-webkit-user-select:none]` cooperam | OK — drag intent honored via hook + CSS |
| Icon + label + sub | lines 332-340 each reason renders `<span>{r.icon}</span>` + `<span>{r.label}</span>` + `<span>{r.sub}</span>` | OK |
| `vaul-style` (sem dependência externa) | Comment lines 16-21 explica o "vaul NÃO está em package.json. Implementamos via touch handlers + transform/transition CSS" | OK — custom impl conforme spec |

## Tokens used

- `text-ink`, `text-mute`, `text-faint`, `border-border-soft`, `bg-bg`, `bg-surface`, `border-ink`, `bg-black` (line 261 backdrop) — canon
- `text-danger`, `border-danger/40`, `bg-danger/10` (line 348) — canon error tokens
- `bg-faint` no disabled CTA state (line 361) — canon disabled token

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — sem swaps. **PASS**
2. Tipografia — eyebrow line 311 `font-mono text-[10px] uppercase tracking-[1.5px]`; title line 314 `text-[22px] font-semibold tracking-[-0.02em]`; body line 317 `text-[13px]`. **MINOR DRIFT** — title aqui é 22/600 (`font-semibold`), não 26/700 como nas outras locked surfaces. Mas é uma sheet, não fullscreen — title menor é apropriado pro bottom-sheet header (canvas V20 sheet header é menor). Não block.
3. Layout — sheet é absolute bottom (não `grid place-items-center` no `<main>`). Regra 3 é sobre layouts fullscreen, não sheets. **N/A**
4. Copy — não aplicável aqui (regra 4 é "Seu nome" vs "Seu primeiro nome"; este sheet não tem esse copy)
5. Sem modal-card border-ink 1.5px — sheet TEM `border-[1.5px] border-b-0 border-ink` (line 269). **Discussão:** Regra 5 proíbe modal-card border-ink 1.5px **NO WelcomeModal**, não em outros surfaces. Sheets V20 podem ter border-ink top edge (canvas pattern). **PASS** (regra é WelcomeModal-specific)
6. Sem `flex-1` spacer — sheet usa `flex flex-col`; o `data-scroll-area` (line 321) é o ÚNICO `overflow-y-auto`; CTA fica `mt-4` (line 358). **PASS**
7. PillButton custom — **DRIFT MINOR**: O CTA "Confirmar chamado" (line 354-367) é um `<button>` raw, NÃO um PillButton custom. Comment não justifica explicitamente, mas o styling replica o PillButton filled (rounded-full px-5 py-3.5 bg-ink text-white). **Documentado em drift-summary.md.**

## Drifts

1. **Title aqui é `text-[22px] font-semibold` (line 314)** em vez de canon 26/700. Possível drift, mas pode ser apropriado pra sheet header (canvas V20 sheet ≠ fullscreen title). Não block.
2. **CTA é `<button>` raw em vez de PillButton custom** (line 354-367). Visual equivalente (mesma forma + token), mas viola regra 7 estritamente. Sugestão: substituir por `<PillButton variant="filled" fullWidth disabled={!selected || submitting}>`.

## Observations

- Drag handle 40×4 cinza claro: line 289 `<div className="h-[4px] w-10 rounded-[3px] bg-border-soft opacity-60" />` — canon (canvas V20 specifies 40×4).
- Sheet altura 78dvh max (line 269 `max-h-[78dvh]`) + drag dismiss threshold via `useSheetDrag` (line 153-156). Canon spec mentions "~52% altura" — current impl é max 78%, dinamicamente shrinka pro content. Não block — sheet adapta.
- `border-[1.5px]` no top edge (line 269) — canon V20 sheet style (NOT WelcomeModal style which spec forbids).
- `pb-safe` (line 269) — iOS notch-safe. Canon mobile pattern. OK.
- `useSheetDrag` hook (line 153) implementa pointer-based drag conforme canvas; `setPointerCapture` + `touch-action: none` no drag handle (line 287 `touch-none`). Vaul pattern preservado.
