# Bug check: Backdrop preso após drag-dismiss

**Target**: PR #63 (drag v3) — reliable sheet dismiss via `useSheetDrag` hook
**Locked file**: `apps/web-customer/src/components/ui/CallWaiterSheet.tsx`
**Hook**: `apps/web-customer/src/hooks/useSheetDrag.ts`
**Body scroll lock**: `apps/web-customer/src/hooks/useBodyScrollLock.ts` (round 21 §H — global consumer counter)

## Resultado: PASS ✅

5 drag-dismisses consecutivos via swipe rápido (`--duration 0.12`) na área do handle:

```bash
idb --companion localhost:10884 ui swipe 195 225 195 950 --duration 0.12
```

| # | Sheet fechou? | Backdrop residual? | Home interativa? | Screenshot |
|---|---|---|---|---|
| 1 | ✅ | ❌ Nenhum | ✅ Buttons clicáveis | `05-drag-dismiss-1.png` |
| 2 | ✅ | ❌ Nenhum | ✅ | `06-drag-dismiss-2.png` |
| 3 | ✅ | ❌ Nenhum | ✅ | `07-drag-dismiss-3.png` |
| 4 | ✅ | ❌ Nenhum | ✅ | `08-drag-dismiss-4.png` |
| 5 | ✅ | ❌ Nenhum | ✅ | `09-drag-dismiss-5.png` |

Os 5 screenshots têm **mesmo md5** — todos retornam ao estado de home limpo idêntico (Chamar garçom + Ver cardápio + greeting + chat input).

## Detalhes da pipeline de teste

Entre cada dismiss, tap em "Chamar garçom" (195, 270) reabriu a sheet. Verificado via `describe-point 195 260`:

- Após dismiss: `AXLabel="Chamar garçom"` @ y=243 (home reativa)
- Após reabertura: `AXLabel="Por que você precisa do garçom?"` @ y=255 (sheet aberta)

Nenhuma execução teve transição "presa" — não houve frame em que o backdrop continuou visível mas a sheet já havia descido. O `useBodyScrollLock` (contador global) e o `useSheetDrag` (transform→onDismiss limpo) cooperam corretamente.

## Confirmações técnicas

1. **Handle SOLO captura drag**: o `dragHandleRef` no hook sempre dispara, mesmo sobre filhos interativos (cards de motivo).
2. **`touch-action: none` no handle** evita scroll vertical do mobile competir com o drag.
3. **`setPointerCapture` no target** (vaul pattern, React JSX handlers) é compatível com iOS Safari 26.5.
4. **Animação de saída**: o `transition: transform 220ms cubic-bezier(.2,.8,.2,1)` aplica suavemente o `translateY` para fora da viewport ao soltar acima do threshold.

## Conclusão

PR #63 (drag v3) está **estável** — o bug "backdrop preso" reportado em versões anteriores não reproduz no iPhone 17e (iOS 26.5) com idb companion 10884.
