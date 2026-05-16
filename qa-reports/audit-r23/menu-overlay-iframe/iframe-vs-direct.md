# Iframe (overlay) vs Direct (`/cardapio` rota)

## Mesmo componente, 2 modos

`apps/web-customer/src/app/[slug]/cardapio/page.tsx` (linhas 76-95, 337-350) renderiza **o mesmo body** em ambos os modos. A diferença é o wrap:

```tsx
const isEmbed = searchParams.get('embed') === '1';

// loading state
if (isEmbed) {
  return <main className="flex min-h-dvh flex-col bg-bg">{spinner}</main>;
}
return <AppShell …>{spinner}</AppShell>;

// rendered body
if (isEmbed) {
  return <main className="flex min-h-dvh flex-col bg-bg">{body}</main>;
}
return <AppShell …>{body}</AppShell>;
```

## Diferenças observadas (side-by-side)

| Aspecto | Embed (iframe via overlay) | Direct (`/cardapio`) |
|---|---|---|
| Wrapper | `<main flex min-h-dvh flex-col bg-bg>` | `<AppShell>` (header + drawer + footer nav) |
| Header | Ausente (overlay tem chrome próprio: handle + drag) | "Mesa 02" + drawer hamburger |
| Footer nav | Ausente | Footer com home/cardapio/pedido (canon V20) |
| Drag handle | Sim (h-12 + bar 5×48) | Não |
| Backdrop ink/32 | Sim | Não |
| Background | Translucent overlay (sheet com `bg-bg` rounded-t-[22px] border-[1.5px] border-ink) | Full opaque page |
| Continuation hint `viu_menu` | Apenas quando overlay **fecha** (UIStateProvider:48-52 chama `recordContinuationHint`) | Imediato no mount (cardapio/page.tsx:91-95: `useEffect` chama `recordContinuationHint('viu_menu')` se `!isEmbed`) |
| URL navegada | iframe SRC `/cardapio?embed=1&category=…&tab=…` | `/cardapio` (ou `?repeat=1`) |
| Profundidade history | NÃO empilha history (sheet React state) | Empilha (router.push) |
| Visibilidade da chat por baixo | Sim, backdrop semi-transparente revela chat preservado | Não (page mudou) |

## Por que iframe e não componente compartilhado?

**Round 21 §A** comment em MenuOverlay.tsx:13-21:

> Estratégia: a sheet hospeda um `<iframe>` apontando pra `/[slug]/cardapio?embed=1`. Mesmo origin → iframe compartilha sessionStorage (session token, customerId), então pedidos funcionam.

Decisão de design: evitar refator do componente `cardapio` em duas formas (componente + rota). O iframe carrega exatamente a mesma página com `?embed=1`. Trade-off:

- ✅ Zero duplicação de UI
- ✅ Bug fixes no /cardapio direto também aplicam no overlay
- ✅ Mesma origin → cookies, sessionStorage, fetchs com x-session-token funcionam dentro do iframe sem CORS hassle
- ⚠️ Iframe = extra HTTP fetch + extra React tree mount (não compartilha cache com parent)
- ⚠️ Communication parent ↔ iframe via `postMessage` ou similar (não usado atualmente — overlay só lê, não controla iframe state)

## Propagação `category` / `tab` no embed src

`MenuOverlay.tsx:81-84`:

```ts
const embedParams = new URLSearchParams({ embed: '1' });
if (isDrinkCategory(category)) embedParams.set('tab', 'bebidas');
if (category) embedParams.set('category', category);
const embedSrc = `/${slug}/cardapio?${embedParams.toString()}`;
```

`isDrinkCategory()` (MenuOverlay.tsx:40-43):
```ts
return /bebida|drink|vinho|cerveja|suco|água|agua|refrigerante/i.test(category);
```

`cardapio/page.tsx:78-83` (consumindo):
```ts
const requestedCategory = searchParams.get('category');
const initialTab: Tab =
  searchParams.get('tab') === 'bebidas' ||
  (requestedCategory ? categoryLooksLikeDrink(requestedCategory) : false)
    ? 'drink'
    : 'food';
```

E `cardapio/page.tsx:158-168` (auto-seleção de pill categoria):
```ts
useEffect(() => {
  if (!requestedCategory || categories.length === 0) return;
  const wanted = normalizeCategory(requestedCategory);
  const match = categories.find((cat) => {
    const normalized = normalizeCategory(cat.name);
    return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized);
  });
  if (!match) return;
  setTab(inferKind(match));
  setActiveCategory(match.id);
}, [categories, requestedCategory]);
```

Quando LLM dispatcha `view_menu(category=bebida)`:
- MenuOverlay seta `?embed=1&tab=bebidas&category=bebida`
- cardapio/page.tsx sees `tab=bebidas` → `initialTab='drink'` (tab Bebidas filled black)
- `categories` resolve → useEffect normaliza "bebida" → fuzzy match contra cat.name (e.g. "Bebidas Sem Álcool", "Bebidas Alcoólicas") → seta `activeCategory=<match.id>`, filter pill ativa

## Origem do "Ver cardápio" e divergência

Existem **3 entrypoints** pro /cardapio. Apenas 1 abre overlay:

| Origem | Comportamento | Local |
|---|---|---|
| `view_menu` tool dispatch da IA | `openMenuOverlay(category)` → overlay com iframe | `assistente/page.tsx:880-886` |
| `<PillButton onClick={() => push('/cardapio')}>` na Mesa Home | Navegação direta (AppShell) | `mesa/[tableCode]/page.tsx:559-562` |
| `<PillButton onClick={() => push('/cardapio')}>` no Assistente Landing | Navegação direta (AppShell) | `assistente/page.tsx:1437-1440` |
| Drawer nav / "Repetir última visita" / pedido revisar etc | Navegação direta | múltiplos |

**Decisão de design intencional**: o overlay preserva o contexto do chat (canvas V20 §F05 line 216). Quando o user toca uma pill na home, não tem chat pra preservar — então rota direta é canônica. Quando a IA dispatcha `view_menu`, o chat está ativo e perder contexto seria UX ruim.

**Screenshot lado-a-lado**: `03-overlay-bebidas.png` (overlay) vs `08-direct-cardapio.png` (direct).
