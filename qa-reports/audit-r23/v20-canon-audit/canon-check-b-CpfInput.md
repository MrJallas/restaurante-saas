# canon-check (b) — CpfInput

**File:** `apps/web-customer/src/components/welcome/CpfInput.tsx` (lines 1-60)

## Canon spec (CLAUDE.md §V20-locked)

| Spec | Where in source | Status |
|---|---|---|
| Input "naked" — NÃO gerencia próprio border | Component is just `<div className="w-full"><input ...></div>` (line 37-52); zero border classes on the input | OK |
| Sinaliza `onFocusChange` pro shell pai | line 16: `onFocusChange?: (focused: boolean) => void;`; line 44: `onFocus={() => onFocusChange?.(true)}`; line 45-48: `onBlur` calls `onFocusChange?.(false)` | OK |
| NÃO readicionar border/padding aqui | Input className (line 51) é apenas `w-full bg-transparent text-[17px] font-medium tracking-[-0.012em] text-ink outline-none tabular-nums placeholder:text-faint` — sem `border-*` nem `px-*`/`py-*` próprios. Apenas o parent FieldShell aplica `border-[1.6px]` + padding `px-[18px] py-[14px]` | OK |

## Tokens used

- `text-ink`, `text-faint` (placeholder), `bg-transparent` — canon
- `tabular-nums` — numeric digit alignment (canon for CPF/numeric inputs)
- No `border-*`, no `bg-bg`/`bg-surface` — correct, shell owns those

## Drifts

**None detected.** CpfInput é "naked" e delega border/focus state pro parent FieldShell, exatamente como CLAUDE.md spec.

## Observations (informational)

- Lines 53-57 renderizam um erro "CPF inválido. Confira os números." (mono caps text-danger) abaixo do input se `showError`. Esse error é renderizado DENTRO do shell parent (entre o input e o final do `<div className="w-full">`), o que faz com que a mensagem fique inside the bordered FieldShell. Não viola spec — apenas posição visual. Se quiser sair fora do border, mover essa `<p>` pro consumer; mas spec não exige isso.
- `setTouched(true)` on blur (line 46): erro só aparece se já interagiu com o campo + completou os 11 dígitos invalidamente. Decisão UX correta.
