Subagent: menu-overlay-iframe
Status: PASS (8/8 ✅ · 0 issues · 0 regressões)

Device: iPhone Air UDID 78E7FAAF-63DD-4451-A09D-910074BFF8A4 via idb localhost:10885
Branch: fix/customer-tools-and-continuation (PRs #53-#56)
Table: M02 (HMAC secret f071eda7-4c4b-4a40-b5eb-da957f000076) — M01 tinha sessão de host prévia

## 8 cenários

| # | Cenário | Status |
|---|---|---|
| a | Dispatch LLM view_menu abre overlay h-[88dvh] com iframe | ✅ |
| b | Tab "Bebidas" pré-selecionada via ?tab=bebidas&category=bebida | ✅ |
| c | 5 drags rápidos (0.15s) dismissam sem backdrop preso | ✅ 5/5 |
| d | Drag lento (1.5s) dismissa; drag curto sub-threshold snapa back | ✅ vaul 60% threshold respeitado |
| e | Scroll dentro do iframe não dispara drag do sheet | ✅ iframe captura touch internamente |
| f | /cardapio direto mostra AppShell completo (sem overlay handle) | ✅ |
| g | Tap item card → /cardapio/[itemId] com detalhes | ✅ |
| h | Safari back com overlay aberto: state preservado, dismissível por drag | ✅ (overlay state ≠ router history) |

## Pontos técnicos críticos validados

### 1. MenuOverlay usa iframe (não componente compartilhado)
- `?embed=1` skipa `<AppShell>` em `cardapio/page.tsx:337-350`
- Zero duplicação de UI; bug-fix em /cardapio aplica nos dois modos

### 2. Drag handle único surface ativo
- `h-12` div com `touch-action: none`
- Iframe ocupa o resto, captura pointer events que NÃO sobem ao parent
- Scroll iframe não dispara drag — `useSheetDrag` instanciado com `respectInternalScroll: false`

### 3. 3 entrypoints pro /cardapio, apenas 1 abre overlay
- `view_menu` AI tool dispatch (`assistente/page.tsx:880-886`) → `openMenuOverlay(category)`
- "Ver cardápio" PillButton na Mesa Home (`mesa/[tableCode]/page.tsx:561`) → `push(/cardapio)` direto
- "Ver cardápio" PillButton no /assistente landing (`assistente/page.tsx:1438`) → `push(/cardapio)` direto

**Decisão de design intencional canvas V20 §F05** — overlay só faz sentido com chat ativo por baixo a preservar.

### 4. Propagação tab/category robusta
- `MenuOverlay.tsx:81-84` aplica `isDrinkCategory()` regex (bebida|drink|vinho|cerveja|suco|água|agua|refrigerante) → `?tab=bebidas` se bate
- `cardapio/page.tsx:78-83` lê `tab=bebidas` → `initialTab='drink'`
- `cardapio/page.tsx:158-168` fuzzy match bidirectional includes pra activeCategory pill — aceita "bebida" → "Bebidas Sem Álcool" ou "Bebidas Alcoólicas"

### 5. useSheetDrag touch path nativo
- addEventListener `passive:false` em `useSheetDrag.ts:309-323`
- React JSX onTouchMove é passive:true em iOS Safari 26.x e bloqueia preventDefault()
- Hook usa Pointer path só pra mouse

### 6. CLOSE_TRANSFORM_BUFFER_PX = 96
- `useSheetDrag.ts:36` evita "split-state lâmina"
- Adiciona 96px ao dismissTarget pra sheet limpar viewport antes do unmount

## Issues encontrados: **NENHUM**

Round 21 §A/§G/§H implementação robusta. Zero regressões, zero issues no iPhone Air iOS 26.5.

## V20 canon
- Overlay h-[88dvh] ✅
- Drag handle 40×4 top ✅
- Tabs Bebidas/Entradas/Pratos/Sobremesas ✅
- Item cards: imagem + nome + preço + tag ✅

## Bugs novos
- Nenhum

## Setup técnico (útil pra outros subs iOS)
- Mesa M02 escolhida (M01 com sessão host prévia)
- Welcome via `idb ui describe-point` pra localizar TextField logical coords (input y=420)
- 5 reaberturas overlay via tap no chip "Bebidas" no chat suggestions — redispatcha view_menu LLM-side

Tempo: ~28.2min
