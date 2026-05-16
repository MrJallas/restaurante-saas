# canon-check (f) — Reclaim banner

**File:** `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` (lines 528-554)
**Mounted at:** Inline em `/[slug]/mesa/[tableCode]` quando `reclaimBanner === true` (triggered por `customer.wasReclaim` no `handleWelcomeComplete` line 352-355).
**Visual evidence:** Source review only (requires customer reclaim state — only triggers on returning-user CPF reclaim path).

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| V20 canon discreet hint (border-soft + bg-surface) | line 536: `className="mx-[22px] mt-3 flex items-start gap-2.5 rounded-[12px] border border-border-soft bg-surface px-3.5 py-3 text-[12px] leading-[1.5] text-ink text-pretty"` | OK |
| Mono eyebrow `CONTA RECONHECIDA` | line 545-547: `<span className="block font-mono text-[10px] uppercase tracking-[1.5px] text-mute">Conta reconhecida</span>` | OK — note: lowercase in JSX but `uppercase` className transforms it to render as CAPS |
| NÃO voltar pro amber/yellow | Sem nenhuma class `bg-amber*`, `bg-yellow*`, `border-amber*`, `text-amber*` no banner block. Apenas `border-border-soft + bg-surface + text-ink + text-mute` | OK — comment line 529-532 explicitly states "Round 4: amber/yellow do V13 trocado pelo discreet hint canon V20" |
| Discreet hint pattern | rounded-[12px] (not full pill) + small text-[12px] body + small icon circle (line 538-543 `h-[18px] w-[18px] rounded-full border-[1.2px] border-ink/60`) — discreet, não shouty | OK |

## Tokens used

- `border-border-soft`, `bg-surface`, `text-ink`, `text-mute`, `border-ink/60` (alpha modifier on canon token) — todos canon V20
- **No** `bg-amber-*`, `bg-yellow-*`, `text-amber-*` — V13 abandoned tokens not reintroduced
- `data-testid="reclaim-banner"` (line 535) for test stability

## Regras de ouro check (per CLAUDE.md)

1. Tokens visuais — sem swaps; sem amber/yellow. **PASS**
2. Tipografia — eyebrow mono 10/uppercase/1.5px (line 545-547); body 12/regular (line 536 `text-[12px]`); sub-body inherits 12px. **PASS** (eyebrow canon; body é smaller-than-typical 15 mas apropriado pra hint discreto — V20 hint pattern)
3. Layout — banner is inline strip, não fullscreen layout. Regra 3 N/A.
4. Copy — não aplicável (regra 4 é "Seu nome").
5. Modal-card — N/A, é banner inline.
6. `flex-1` spacer — N/A, banner é inline strip.
7. PillButton — N/A, banner não tem CTA.

## Drifts

**None detected.** Comment line 529-532 confirma explicitamente que o swap V13 amber → V20 discreet hint foi intencional e está preservado.

## Observations

- Banner auto-dismiss em 5s (line 354 `setTimeout(() => setReclaimBanner(false), 5000)`) — UX correta, não polui home indefinidamente.
- Icon `!` (line 540-543) usa `border-ink/60 text-ink/70` (alpha-modified canon tokens) — V20 sanctioned utility, não introduz tokens novos.
- Copy "Conta reconhecida" + "Bem-vindo de volta. Se não foi você quem fez login agora, é só avisar o garçom." — canon V20 wording (per CLAUDE.md "CONTA RECONHECIDA").
