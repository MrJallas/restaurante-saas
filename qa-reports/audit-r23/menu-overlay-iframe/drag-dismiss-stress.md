# Drag-dismiss stress test — MenuOverlay (88dvh sheet, iframe body)

## Setup

- Device: iPhone Air iOS 26.5 (UDID `78E7FAAF-...910074BFF8A4`)
- Overlay aberto via dispatch LLM `view_menu(category=bebida)`
- Sheet logical viewport: 420×912; sheet = 88dvh = ~803px tall; topo do sheet em y≈109 logical (safe-area incluida)
- Drag handle: `h-12 w-full` (48px tall) com bar visual `h-[5px] w-12` em rounded-[3px]
- Re-abertura entre testes via tap em chip "Bebidas" no scroll horizontal de suggestions (a IA re-dispatcha `view_menu`)

## Hook `useSheetDrag` (key behavior)

- `dismissThreshold = 0.6` (60% sheet height) — abaixo disso snapa back
- `respectInternalScroll: false` no MenuOverlay (iframe gerencia próprio scroll)
- Touch path nativo (`addEventListener` passive:false) — pointer path só pra mouse
- `CLOSE_TRANSFORM_BUFFER_PX = 96` evita "split-state lâmina" (sheet residual após dismiss)
- Threshold basis usa `Math.min(measured, estimated)` — não dispara prematuro em sheets altos

## Drag RÁPIDO 5× — duration 0.15s, swipe (210, 170) → (210, 950)

| # | Resultado | Screenshot |
|---|-----------|------------|
| 1 | Dismiss OK · backdrop limpa, chat reaparece com bubble user + ASSISTENTE · VIEW_MENU + "Abre o cardápio…" | `04-after-drag-dismiss-1.png` |
| 2 | Dismiss OK · 2º dispatch acumulado no chat | `05-after-drag-dismiss-rapid.png` |
| 3 | Dismiss OK · 3 dispatches visíveis (test stress) | (chat continua) |
| 4 | Dismiss OK · sem flash residual | (chat continua) |
| 5 | Dismiss OK · transição final limpa | `05b-after-drag5-clean.png` |

**Observações**:
- 5/5 dismisses, **0 backdrop preso**, **0 sheet sliver lâmina**, **0 frame flash**.
- `CLOSE_ANIMATION_MS = 220` casa com o `transition: transform 220ms` inline — sem race.
- Cada reabertura via tap em chip dispatcha o `view_menu` novamente via WS streaming, então o caso de "stale state após múltiplos dispatches" também foi exercitado.

## Drag LENTO — duration 1.5s

**Procedimento**: swipe (210, 170) → (210, 950) duration 1.5s

**Resultado**: Dismiss OK. `finishDrag()` compara `currentDragY / thresholdBasis >= 0.6`. Para drag de 780px com sheet=803px → 0.97 >= 0.6 → `scheduleDismiss(dismissTarget)` → animação suave, sheet sai pro bottom + backdrop fade in 220ms.

**Screenshot**: `06-after-slow-drag.png`

## Drag CURTO LENTO — duration 1.0s, distância 230px

**Procedimento**: swipe (210, 170) → (210, 400) duration 1.0s. Apenas ~29% do sheet height.

**Resultado**: **Snap back** — sheet retornou pra posição original (translateY=0). `currentDragY=230 / threshold=803 = 0.29 < 0.6` → `cancelScheduledDismiss()` + `setDragY(0)`.

**Screenshot**: `06b-short-drag-snap-back.png`

**Conclusão threshold vaul respeitado**: abaixo de 60% → snap back; acima → dismiss + slide-out animation.

## Drag dentro do iframe (NÃO no handle)

Coberto em `scenarios.md` (e) — confirmou que swipe na área do conteúdo do iframe **scrolla** (touch-action: pan-y dentro), **não** dispara drag do sheet. Drag exclusivamente via handle bar de 48px.

## Edge cases não cobertos (notar para futuro)

- **Drag durante animação de slide-out**: não testado (não há trigger natural — sheet some em 220ms).
- **Multi-touch**: hook trata só `e.touches.length === 1` no startDrag, então 2 dedos juntos não disparam — não exercitado.
- **Drag horizontal**: hook só observa delta Y (`delta = clientY - dragStartY`), swipe horizontal não dispara drag mas tampouco bloqueia — não causa bug.

## Veredito

**PASS**. Sem regressão observada. Drag-dismiss robusto em ritmo rápido, lento e edge (sub-threshold). Backdrop nunca ficou preso após dismiss em 5 tentativas consecutivas.
