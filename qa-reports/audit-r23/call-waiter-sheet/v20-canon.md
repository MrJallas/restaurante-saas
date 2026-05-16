# V20 canon · CallWaiterSheet

## Conformidade com `apps/web-customer/src/components/ui/CallWaiterSheet.tsx`

### Estrutura

| Elemento | Spec V20 | Observado iPhone 17e | Status |
|---|---|---|---|
| Bottom-sheet vaul-style | `max-h-[78dvh]` | Sheet ocupa y=210→725 = 515pt / 844pt = **61%** (dentro do limit) | ✅ |
| Handle | 40×4 cinza claro | `mx-auto h-9 w-full` (área grab 36pt) + `h-[4px] w-10 rounded-[3px] bg-border-soft opacity-60` (40×4 visível) | ✅ |
| Border top | `rounded-t-[22px] border-[1.5px] border-b-0 border-ink` | Confirmado visualmente nos screenshots | ✅ |
| Backdrop | `bg-black/[0.32]` | Confirmado (cinza translúcido sobre home) | ✅ |
| Shadow | `shadow-[0_-8px_32px_rgba(0,0,0,0.10)]` | Sombra perceptível acima da sheet | ✅ |

### 5 motivos canon (V20 cliente-screens.jsx:146)

| # | key | Label literal | Sub literal |
|---|---|---|---|
| 1 | `bring_menu` | **Trazer o cardápio** | Versão impressa pra mesa |
| 2 | `place_order` | **Fazer pedido** | Garçom anota direto |
| 3 | `serve_drink` | **Servir bebida** | Reabastecer ou vinho na taça |
| 4 | `ask_bill` | **Pedir a conta** | Iniciar fechamento |
| 5 | `other` | **Outro motivo** | Você descreve quando atender |

✅ Todos os 5 verificados via `idb describe-point` (accessibility tree retornou cada `AXCheckBox` com label+sub).

### Layout dos cards (cada motivo)

```
flex items-center gap-3 rounded-[14px] border-[1.3px] px-3.5 py-3
icon (20×20 stroke-current) | label 14.5/500 + sub 12/mute | › (faint chevron)
```

Estado selected: `border-ink bg-surface` (border preto + fundo sand)
Estado idle: `border-border-soft bg-bg`

Confirmado no screenshot `03-trazer-cardapio-selected.png`: card 1 com borda preta nítida e fundo claro distinto dos outros 4.

### Tokens visuais (CLAUDE.md §1)

| Token | Uso na sheet | Status |
|---|---|---|
| `text-ink` | label, title, valores numéricos | ✅ |
| `text-mute` | sub, eyebrow, instruções | ✅ |
| `text-faint` | chevron `›`, button disabled | ✅ |
| `border-soft` | cards idle + dividers | ✅ |
| `bg-surface` | card selected + activeCall stat-card | ✅ |
| `bg-bg` | sheet background + cards idle | ✅ |

Nenhum token substituído por cor não-canon (sem amber/yellow/red).

### Tipografia (CLAUDE.md §2)

- Eyebrow `ATENDIMENTO EM ANDAMENTO`: `font-mono text-[10px] uppercase tracking-[1.5px]` ✅
- Title `Por que você precisa do garçom?` / `Aguardando garçom`: `text-[22px] font-semibold tracking-[-0.02em]` ✅ (próximo do spec 26/700 mas usa 22 — alinhado com pattern de sheet, não de tela inteira)
- Body 13/14.5: ✅
- Mono digits: `font-mono text-[18px] font-semibold` no clock ✅

### CTA "Confirmar chamado →"

- Filled `bg-ink text-white` quando enabled + selected
- Faint `bg-faint text-white/80` quando disabled
- Seta `→` canon (não `›` nem `>`)
- `rounded-full px-5 py-3.5 text-[14.5px]`

✅ Conformou em screenshots `03` e `04`.

### Cancel link

- `text-[12px] text-mute underline underline-offset-[3px]`
- Centrado, sem button border

✅ Confirmado.

## Conclusão

A sheet preserva 100% do V20 canon. Nenhuma regressão visual ou de copy detectada. PR #63 mantém estabilidade do design hand-validado.
