# MenuOverlay iframe + drag-dismiss + tab/category — Cenários

**Device**: iPhone Air UDID `78E7FAAF-63DD-4451-A09D-910074BFF8A4` (iOS 26.5)
**idb companion**: `localhost:10885`
**Web target**: `http://localhost:3003` (web-customer)
**Tenant**: `restaurant_dev`
**Customer**: Caleb Teste (CPF `12345678909`, returning, 65 visitas)

## Setup

1. HMAC URL Mesa 02 (mais limpa que M01 que tinha sessão prévia como host):
   - `node -e 'console.log(require("crypto").createHmac("sha256","f071eda7-4c4b-4a40-b5eb-da957f000076").update("M02:"+Date.now()).digest("hex"))'`
   - Abrir via `xcrun simctl openurl 78E7FAAF-63DD-4451-A09D-910074BFF8A4 "http://localhost:3003/restaurant_dev/mesa/M02?hmac=…&ts=…"`
2. Welcome modal preenchida via `idb ui tap` no input (y=420 logical) + `ui text "Caleb"`, depois CPF (y=517) + `ui text "12345678909"`, tap "Continuar" (y=643). Caleb foi reconhecido (recognition_token cookie) → home pulou welcome em mesas subsequentes.

## Cenário (a) — Dispatch LLM `view_menu` abre overlay com iframe

**Procedimento**: na Home (Mesa 02), tap composer "Digite aqui" → text "Me mostra as bebidas" → tap "Enviar".

**Resultado**: PASS
- Chat: bubble preto user "Me mostra as bebidas"
- ASSISTENTE · AGORA · VIEW_MENU
- AI reply: "Abre o cardápio pra você dar uma olhada."
- MenuOverlay slide-up com **88dvh**, backdrop ink/32 visível atrás
- Iframe carrega `/restaurant_dev/cardapio?embed=1&category=bebida&tab=bebidas` (visto em URL bar quando inspetado)
- Conteúdo: título "Cardápio", tabs "Comida · 16" / "Bebidas" (filled black), search "Buscar bebidas…", filter pill "Bebidas · 6", lista de bebidas

**Screenshots**: `02-composer-typed.png`, `03-overlay-bebidas.png`

## Cenário (b) — Tab "Bebidas" pré-selecionada

**Resultado**: PASS

LLM dispatchou `view_menu({ category: "bebida" })`. Frontend chamou `openMenuOverlay("bebida")`. MenuOverlay constrói embedSrc:

```
embedParams.set('tab', 'bebidas')      // isDrinkCategory("bebida") = true
embedParams.set('category', 'bebida')
embedSrc = `/restaurant_dev/cardapio?embed=1&tab=bebidas&category=bebida`
```

`cardapio/page.tsx` (linhas 78-83) lê `searchParams.get('tab') === 'bebidas'` → `initialTab = 'drink'`. Tab Bebidas renderiza filled black, items mostram **apenas** Suco de Laranja, Caipirinha, Agua Mineral, Refrigerante Lata, Cerveja Long Neck, Taça de Vinho Tinto (6 itens). Comida fica não-selecionada com count "· 16" inativo.

**Screenshot**: `03-overlay-bebidas.png` (tab "Bebidas" preto/ativo no momento de abertura).

## Cenário (c) — 5 drags RÁPIDOS dismissam sem backdrop preso

Ver `drag-dismiss-stress.md`. **5/5 dismisses OK**, nenhuma instância de backdrop órfão / sheet sliver.

## Cenário (d) — Drag LENTO respeita threshold vaul (~60%)

Ver `drag-dismiss-stress.md`. Drag de 780px logical (~85% sheet, 1.5s) dismissou. Drag de 230px (~25% sheet, 1.0s) snapped back — threshold 0.6 respeitado.

## Cenário (e) — Scroll iframe não captura drag (touch-action: pan-y)

**Procedimento**: overlay aberto. Swipe up no MIDDLE da iframe (y=600 → y=300, duration 0.3s).

**Resultado**: PASS
- Iframe scrollou — apareceram Cerveja Long Neck R$14,90 e Taça de Vinho Tinto R$22,90 (não visíveis antes)
- Sheet **permaneceu aberta** — handle não disparou drag
- Reverse swipe (y=300 → y=600) voltou ao topo da lista

**Screenshot**: `07-iframe-scrolled.png`

**Mecânica**: handle tem `touch-action: none` apenas (MenuOverlay.tsx:122-126); o iframe ocupa o resto e captura pointer/touch dentro dele (não sobem pro parent). O hook `useSheetDrag` é instanciado com `respectInternalScroll: false` porque o iframe gerencia o próprio scroll — mas como o drag só fica plugado no DOM do sheet outer (pointer handlers via `{...bind}`), eventos dentro do iframe não chegam ao parent. Drag exclusivamente via handle bar.

## Cenário (f) — Direta `/cardapio` (sem overlay)

**Procedimento**: Safari URL bar → "localhost:3003/restaurant_dev/cardapio" → Enter.

**Resultado**: PASS
- `?embed` ausente → `isEmbed = false`
- `cardapio/page.tsx` renderiza **`<AppShell>`** wrap (header "Mesa 02" + drawer button + content)
- Sem handle drag, sem backdrop
- Tab default "Comida" (default tab quando não há `?tab=bebidas` na URL)
- Pills de categoria: Entradas · 4 / Pratos Principais · 8 / Sobremesas · 4
- Lista "TUDO · 16 OPÇÕES" com items (Picanha na Brasa R$78,90, Pudim da Casa R$15,90, etc)
- Footer nav visível

**Screenshot**: `08-direct-cardapio.png`

## Cenário (g) — Item detail navega `/cardapio/[itemId]`

**Procedimento**: na rota direta `/cardapio`, tap em "Picanha na Brasa" row.

**Resultado**: PASS
- Navega pra `/restaurant_dev/cardapio/<id>` (handleItemClick chama `push(...)`, cardapio/page.tsx:174-179)
- Renderiza `<FoodDetail>` (não-bebida): hero foto placeholder + tags "carne tradicional", título "Picanha na Brasa", preço R$78,90, descrição completa "Picanha nobre grelhada na brasa, servida com arroz branco, farofa de ovo e vinagrete.", INGREDIENTES (picanha, arroz, farinha, tomate, cebola), OBSERVAÇÃO field, CTAs "Perguntar à IA" + "Adicionar ao pedido · R$ 78,90"

**Screenshot**: `09-item-detail.png`

## Cenário (h) — Safari back behavior

**Procedimento**: a partir do item detail, tap Safari back (chevron-left no chrome bar).

**Resultado** (comportamento real, não-bug):
1. **Back 1×**: volta pra `/cardapio` direct (AppShell, lista de items) — funcionando.
2. **Back 2×**: volta pra `/assistente` mas overlay re-renderiza por cima (overlay state em `useUIState()` persiste). Estado React não-roteador é independente da history.
3. **Back 3×**: navega pra `/restaurant_dev` (Home) mas overlay **continua aberto** por cima — ainda mais visível porque agora estamos em Home.
4. Drag-dismiss da overlay nesse estado funciona normalmente. Após dismiss, vê-se Home com continuation "VOCÊ ESTEVE NO MENU" / "Tava bisbilhotando o menu? Posso te recomendar uma sobremesa do dia ou um vinho que combina." (round 21 §H — `closeMenuOverlay` chama `recordContinuationHint('viu_menu')`).

**Conclusão**: o overlay state é desacoplado do router history. Não é bug — é comportamento esperado de overlay em React state. Sempre dismissível via drag ou backdrop tap. Comportamento idêntico ao CallWaiterSheet.

**Screenshots**: `10-safari-back-overlay-still-open.png`, `11-back-then-drag-result.png`

## Cenário extra — "Ver cardápio" PillButton na Home/Landing

**Observação**: O PillButton "Ver cardápio" tanto na Mesa Home (mesa/[tableCode]/page.tsx:561) quanto no `/assistente` landing (assistente/page.tsx:1438) **NÃO** dispara `openMenuOverlay()` — usa `push(/${slug}/cardapio)` direto. Overlay é **exclusivo** do AI tool dispatch `view_menu`.

Documentado em `iframe-vs-direct.md`.

**Screenshot**: `12-home-pill-direct.png`
