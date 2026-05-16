# Propagação tab/category — LLM → Overlay → Iframe

## Fluxo end-to-end

```
User: "Me mostra as bebidas"
   │
   ▼  WebSocket /assistente
AI tool call: view_menu({ category: "bebida" })
   │
   ▼  assistente/page.tsx:880-886
const category = call.arguments?.category;  // "bebida"
openMenuOverlay(category)
   │
   ▼  UIStateProvider.tsx:44-47
setMenuOverlayCategory("bebida")
setMenuOverlayOpen(true)
   │
   ▼  layout.tsx → render <MenuOverlay open category="bebida">
   │
   ▼  MenuOverlay.tsx:81-84
isDrinkCategory("bebida") = true → embedParams.set('tab', 'bebidas')
embedParams.set('category', 'bebida')
embedSrc = "/restaurant_dev/cardapio?embed=1&tab=bebidas&category=bebida"
   │
   ▼  <iframe src=embedSrc>
   │
   ▼  cardapio/page.tsx:76-83
isEmbed = true (skip AppShell wrap)
initialTab = 'drink'  (porque tab=bebidas)
useState<Tab>('drink')
   │
   ▼  cardapio/page.tsx:158-168 (após categories load)
useEffect → normalizeCategory("bebida") = "bebida"
match = categories.find(cat => normalize(cat.name).includes("bebida"))
   → e.g. cat "Bebidas Sem Álcool" → matches
setTab(inferKind(match))         → "drink"
setActiveCategory(match.id)       → filter pill ativa
   │
   ▼  Render
- Tab "Bebidas" filled black
- Filter pill "<categoria_específica>" ativa
- Items filtrados pra essa categoria + tab=drink
```

## Casos testados (live no iPhone Air)

| Categoria passada | Tab inicial | Filter ativo | Resultado |
|---|---|---|---|
| `"bebida"` (singular) | drink (Bebidas) | "Bebidas · 6" (provavelmente categoria parent) | OK · 6 itens drink listados |

(Os outros testes — categoria=sobremesa, =entrada, etc — não foram exercitados live nesta passada porque o LLM consistente mente dispatcha `category=bebida` para "Me mostra as bebidas". Para cobrir, precisaria mensagens como "quero entradas" / "que sobremesas tem" — fora do escopo do sub-agente 4.)

## `isDrinkCategory()` regex

`MenuOverlay.tsx:40-43`:
```ts
function isDrinkCategory(category?: string | null): boolean {
  if (!category) return false;
  return /bebida|drink|vinho|cerveja|suco|água|agua|refrigerante/i.test(category);
}
```

Cobre: bebida, Bebida, BEBIDAS, drinks, vinho, cerveja, suco, água, agua, refrigerante. Sensível a Unicode (água com acento normalizado pelo `i` flag). **Não cobre**: cocktail, coquetel, espumante, chá, café. O `categoryLooksLikeDrink()` em cardapio/page.tsx:52-56 também tem regex similar (mais restrito, sem "drink"/"suco"/"agua") — pequena divergência mas ambos pegam "bebida".

## Quando `category` é null

Se a IA dispatchar `view_menu()` sem argumento, FE passa `null`:
- `embedParams.set('tab', …)` skipado → `?embed=1` sozinho
- `cardapio/page.tsx` cai no default: `initialTab = 'food'`, `requestedCategory = null`, useEffect skipa
- Tab "Comida" filled, sem filter pill ativo, mostra "TUDO · 16 OPÇÕES"

Esse fallback foi visto no Round 4 C-NEW-3 (continuation chips coverage) e não introduziu regressão visível.

## Auto-seleção robusta: includes() bidirectional

`cardapio/page.tsx:163`:
```ts
const match = categories.find((cat) => {
  const normalized = normalizeCategory(cat.name);
  return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized);
});
```

Aceita ambas direções:
- "bebida" busca cat com nome contendo "bebida" → match "Bebidas Sem Álcool" ✓
- "bebidas alcoólicas" busca cat com "bebida" como substring → match "Bebidas Alcoólicas" ✓
- "vinho" não bate `isDrinkCategory("vinho")` regex? Sim, cobre. Tab drink. Procura cat com "vinho" no nome → match se existe categoria explícita "Vinhos"; se só houver "Bebidas", então `wanted.includes(normalized)` ("vinho".includes("bebida")) é false. Sem match → cai no useState inicial `drink` tab + sem activeCategory (lista de bebidas inteira).

## Observação: tab vs categoria — semântica

- **Tab** (`Comida`/`Bebidas`): bucket binário inferido por `inferKind(cat)` em cardapio/page.tsx:38-42 (keywords: bebida, drink, cerveja, vinho, sem álcool, espumante)
- **Categoria** (Entradas, Pratos Principais, Sobremesas, Bebidas Sem Álcool, etc): pill horizontal scroll, filtra a lista dentro da tab atual

`initialTab` é determinado por:
1. `?tab=bebidas` explícito → `drink`
2. Se há `?category=…`, aplicar `categoryLooksLikeDrink(category)` → `drink` ou `food`
3. Default → `food`

Ordem é importante: se LLM passa `category=cerveja` mas regex `isDrinkCategory("cerveja")` for true → `?tab=bebidas` setado, tab=drink. Se passar `category=sobremesa`, regex é false, mas `categoryLooksLikeDrink` é tb false, fica `food`. **Não há `?tab=comida` explícito** porque é o default.

## Verificado live

- "Me mostra as bebidas" → LLM chamou `view_menu(category="bebida")` (visto no chat: `··· VIEW_MENU`)
- Iframe abriu com tab "Bebidas" preto/ativo + pill "Bebidas · 6" ativa + 6 itens drinks (Suco de Laranja, Caipirinha, Agua Mineral, Refrigerante Lata, Cerveja Long Neck, Taça de Vinho Tinto)
- **Propagação tab+category: PASS**

Screenshot: `03-overlay-bebidas.png`
