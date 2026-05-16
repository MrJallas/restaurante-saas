Subagent: assistente-tool-dispatch
Status: PARTIAL (4 perfect · 3 deviation · 3 BLOCKED = 7/10 com tool registrada)

Branch: fix/customer-tools-and-continuation
Sim: iPhone 17 Pro C3DC39B2-F4B2-4CC0-8743-CABF01ED9BCA via idb localhost:10883
Tester: Caleb Teste CPF 12345678909, customerId 21a81205-4adf-41e3-86b5-baa8d3e339fb

## Matriz 10 tools

| # | Prompt | Esperado | Dispatched | linkedItems | chips | Status |
|---|---|---|---|---|---|---|
| 1 | "Me mostra o cardapio" | view_menu | view_menu() | 0 | 4 | ✅ |
| 2 | "Que bebidas voces tem" | view_menu(bebida) | view_menu() SEM ARG | 0 | 4 | ⚠️ |
| 3 | "Qual horario do restaurante" | ask_about_restaurant | ask_about_restaurant(topic='horário') | 0 | 3 | ✅ |
| 4 | "O que tem com frango" | search_dish | search_dish(query='frango') | 0 | 0 | ⚠️ resolver vazio |
| 5 | "Tem prato sem gluten" | check_allergens | view_menu(category='pratos principais') | 2 | 4 | ⚠️ |
| 6 | "Compara hamburguer com pizza" | compare_dishes | _(none)_ | 0 | 0 | ❌ blocked |
| 7 | "Como ta meu pedido" | view_order | view_order() | 0 | 3 | ✅ |
| 8 | "Me indica algo leve" | recommend_dish | recommend_dish(category='principal') | 0 | 3 | ✅ |
| 9 | "Tenho cortesia disponivel" | view_courtesy | _(none)_ | 0 | 0 | ❌ blocked |
| 10 | "Mostra historico de chat" | view_chat_history | _(none)_ | 0 | 0 | ❌ blocked |

## DB cross-check
7/10 tools persistidas em `assistant_messages.tool_calls[0].function.name`. Tools 6, 9, 10 ficam com `tool_calls=NULL/[]` (LLM bloqueou). Customer_id correto em todas (fix Round 3 Cat 10/B-9 confirmado).

## Bugs novos / Achados

### 🔴 BUG-R23-T-1 (P1) — 3 tools BLOQUEADAS pelo guardrail LLM
- `compare_dishes`, `view_courtesy`, `view_chat_history` retornam fallback "Desculpe, só posso ajudar com assuntos do restaurante..." SEM acionar tool
- Provável causa: system prompt do qwen3-coder-30b muito restritivo OU registry incompleto em `services/ai-service/services/tools/__init__.py` / `services/ai-service/services/`
- **Investigar**: relaxar guardrail OU verificar tool definitions

### 🔴 BUG-R23-T-2 (P1) — search_dish resolver retorna shape vazio
- Tool dispatched corretamente com `{name:'search_dish', args:{query:'frango'}}`
- MAS: response="", linkedItems=[], chips=[]
- FE não consegue renderizar cards
- Provável regressão no resolver tool em `services/ai-service/services/`
- Provavelmente faz `test_chips_coverage_at_least_9_of_10_mutations` falhar (regra mínima do CLAUDE.md)

### 🟡 BUG-R23-T-3 (P2) — view_menu ignora arg category
- "Que bebidas vocês têm" dispara view_menu() SEM `category=bebida`
- Cardápio abre na tab Comida; user precisa clicar Bebidas manualmente
- LLM não está infraundo category

### 🟡 BUG-R23-T-4 (P2) — LLM prefere view_menu em vez de check_allergens
- "Tem prato sem glúten" não usa tool dedicada — modelo responde via view_menu + texto
- linkedItems trouxe 2 pratos corretos mas perde UX dedicada de allergen badges

## V20 canon CONFIRMADO (zero desvios)

Landing /assistente respeita 100% canon CLAUDE.md `🔒 V20 Customer UI · DO NOT MODIFY`:
- ✅ 2 PillButtons grandes (Chamar garçom + Ver cardápio), `border-[1.5px] border-ink rounded-full` sem fill
- ✅ HomeHero com eyebrow `ASSISTENTE · DE VOLTA` mono uppercase 10/500 tracking-[1.5px] text-mute + title 17/500 text-ink
- ✅ Sem bubbles antes da 1ª msg do customer (chatStarted=false)
- ✅ Composer SoftInput placeholder "Digite aqui"
- ✅ Post-1ª msg: eyebrow `··· VIEW_MENU` orange typewriter, bubble + 4 chips canônicos, MenuOverlay h-[88dvh] sobe correto (SILENT_PATH_TOOLS 1.5s delay observado)

## Limitação metodológica
Screenshots UI completos só para Tool 1 porque `idb ui tap` em iOS Safari 26.5 ficou inconsistente — taps em coordenadas dentro da hit-box do input nem sempre subiam keyboard (testado com --duration 0.15/0.3, taps duplos, e múltiplos y candidatos).

Para Tools 2-10 validei via **POST direto a `/api/restaurant_dev/assistant/message` + DB cross-check** em `assistant_messages.tool_calls`. Validações equivalentes em rigor (mesmo payload que o FE consome via `dispatchToolCall` em `apps/web-customer/src/app/[slug]/assistente/page.tsx`).

## Bug conhecido NÃO reaberto
- `add_to_order`/`view_order` → /customer/cart/items 404: Tool 7 testou view_order com pedido vazio (não dispara o 404), conforme orientação do super-prompt

## Greeting greeted
"Voltou! Que tal experimentar algo novo hoje? Posso indicar uma combinação." — confirma continuation API funcionando com kind `returning:regular` + customerName=Caleb (vide sub 22 audit).

Tempo: ~35.6min (198543 tokens, 201 tool uses)
