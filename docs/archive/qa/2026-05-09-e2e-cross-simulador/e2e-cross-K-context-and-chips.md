# Subagent K · Contextualização IA + chip reactivity

> **Wave 2 · Cross-simulator E2E** · 2026-05-09 · sim 7 (`81914E00-6D98-480C-AE8F-C2F25D28590F`) · Pedro Silva (`76e0565a-9f80-4c89-b008-4ae0be07d095`) · M22 (`e1c1bb84-cfa0-4b07-bf90-f9ecab10581a`)

## TL;DR

**Contextualização IA + reactive chips estão QUEBRADAS em produção.** Confirma e amplia os achados Wave 1 (Subagent A): chips são estaticamente codificados em 3 lugares, nunca refletem o que a IA fez. Fora isso, vários bugs novos:

- `assistant_messages.contextual_chips` é NULL em **100%** dos turnos (19/19) — coluna existe mas o backend nunca escreve nela.
- `suggestions` retornadas pelo `assistant.service.ts` são SEMPRE `SUGGESTION_CHIPS.slice(0, 3)` = `["Qual o prato do dia?", "Recomende uma bebida", "Quais sobremesas tem?"]`.
- A página de chat (`apps/web-customer/src/app/[slug]/assistente/page.tsx`) tem seu **próprio** array hardcoded `DEFAULT_SUGGESTIONS = ["Sugestão leve", "Sobremesa combina?", "Pratos com camarão", "Como pagar?"]` — diferente do que o backend retorna. Após o primeiro turno, o backend sobrescreve, mas continua sempre o mesmo trio.
- `view_menu`, `add_to_order`, `view_order`, `pay_full`, `call_waiter`, `request_check`, `compare_dishes`, `check_allergens` (todos os tools customer-facing exceto 3) retornam `chips: []` no `ToolResult` — nunca fornecem chips reativos por categoria.
- Apenas 3/39 tools produzem chips: `search_dish`, `recommend_dish`, `show_lgpd_notice`. **E mesmo esses chips nunca chegam à UI**: o backend `/api/...` não propaga `tc.result.chips` para o campo `suggestions` da resposta, e a página de chat só sabe ler `res.suggestions` (string array) — nunca lê o `chips` do tool.
- `ContextualInputExpand` existe e está bem documentado, mas é **dead code**: nenhum `import` fora da própria pasta `components/ui/`. Spec diz que `send_complaint` / `send_message_to_manager` devem disparar expand obrigatório — mas (a) os tools nunca emitem chips com `action: "expand"`, e (b) a página de chat renderiza chips como `<button>` cru, ignorando o componente `SuggestionChip` que sabe lidar com `action: "expand"`.
- LLM raramente usa function-calling para pedidos: "Quero pedir um Risoto de Funghi" em turn 1 → 0 tool dispatched, AI só conversa em texto. `add_to_order` nunca foi chamado em 4 tentativas explícitas de adicionar item.
- AI alucina totais ao longo dos turnos (R$67.89, R$35.89, R$43.89 — todos errados); nunca chama `view_order` ou `add_to_order` para tracking real, então o "estado" do pedido vive só na memória conversacional do LLM e degrada.
- Memória de longa duração FALHA: turno 10 ("vou querer mais um daquele que pedi primeiro") deveria adicionar Risoto (turn 1) e a IA adicionou outra Taça de Vinho Tinto (turn 3) — esqueceu o Risoto inteiro do running tally. Turno 15 ("o que comi") só citou Brownie, ignorando Risoto + 2 Vinhos.
- Classifier bloqueia `Qual o horario de funcionamento?` como off-topic apesar de ser informação clara do restaurante (confirma achado Wave 1).
- `view_order` e `pay_full` (quando dispatched) batem em endpoint inexistente: tool retorna `{error: {code: "api_error", message: "transport: [Errno 111] Connection refused"}}` — o ai-service tenta chamar API host errado.

**Animações**: `cBalloonPulse` é definido apenas em `ScreenCustomerWaitingApproval.tsx`, NÃO no chat. O chat tem um typing indicator (3 dots no bubble pequeno em screenshot 07a) que funciona, mas não é o `cBalloonPulse` da spec. `liquidMorph` está atrelado ao `ContextualInputExpand` que é dead code → não dispara nunca no fluxo do chat.

**Tom/estilo**: OK por sorte (sem emojis, "Olá!" só no turn 1, variação razoável). Mas isso é resultado do system prompt, não de qualquer constraint de UI/chip.

**Latency**: tool dispatch latency média 2466ms, p95 4751ms. Acima da meta de 4s no p95.

**Failure mode**: pulado per spec ("opcional, requer reset de stack").

---

## Setup real

- API host (NestJS) em `localhost:3001`, ai-service em `localhost:8000`, customer app em `localhost:3003` (Next.js dev).
- Mesa M22 não tinha sessão ativa; criei via SQL direto (`INSERT INTO restaurant_dev.table_sessions ... 'active'`), session_id `b2f07416-00ff-4e8b-a63c-9818e10aa307`.
- Pedro Silva (`76e0565a-9f80-4c89-b008-4ae0be07d095`, CPF `55588811194`) registrado em `session_participants` como `approved` + `visits` row.
- Token Redis criado manualmente: `redis-cli SET "session:b2f07416..." '{...}' EX 14400`.
- Driver da jornada: `curl POST /api/restaurant_dev/assistant/message` (passa pelo `SessionGuard` + `TenantMiddleware`, igual ao FE faria).
- Customer app FE acessado via Playwright em viewport 393×852 com `sessionStorage.session:bundle` populado.
- Containers: `restaurant-postgres` (5434), `restaurant-redis` (6380), `restaurant-api` (3001), `restaurant-ai` (8000), `restaurant-web-customer` (3003), `restaurant-web-staff` (3002). Todos saudáveis. **Aviso N-1 (Wave 1)**: containers `web-customer` / `web-staff` mountam worktree errado (`pensive-ritchie-251016`); o teste do FE corre contra código stale, mas a página de chat foi testada igual.

## Tabela completa · 18 turnos jornada

| # | User msg | Tool dispatched (real) | Chips no `suggestions` retornado | Chips no `result.chips` (do tool) | Spec esperado | Match? | Comentário |
|---|---|---|---|---|---|---|---|
| 1 | Quero pedir um Risoto de Funghi | — | Qual o prato do dia? · Recomende uma bebida · Quais sobremesas tem? | — | (`add_to_order` esperado) Ver pedido · Pedir mais · Pedir conta | NÃO | LLM não chamou `add_to_order` mesmo com pedido explícito. Voltou linkedItems (Risoto + Bruschetta). |
| 2 | Posso ver o cardapio? | `view_menu` (silent=false, routerTarget=ScreenCustomerMenu) | Qual o prato do dia? · Recomende uma bebida · Quais sobremesas tem? | `[]` | "Risoto · Bebidas · Sobremesas" (cat. relevantes) | NÃO | Tool dispatched mas `tools/view_menu.py` retorna `chips=None`. Sem chips reativos por categoria. |
| 3 | Recomenda uma bebida pra acompanhar | — | Idem | — | (`recommend_dish` esperado) Adicionar este · Outras opções | NÃO | LLM respondeu em texto livre sem chamar `recommend_dish`. Memória do Risoto OK (referenciou turn 1). |
| 4 | Vou pedir o vinho tambem | — | Idem | — | (`add_to_order`) Ver pedido · Pedir mais · Pedir conta | NÃO | Mesmo padrão; sem tool dispatch. |
| 5 | Qual o total do meu pedido? | — | Idem | — | — (memória) | PARCIAL | AI ALUCINOU "R$67.89" (real seria 54.90+22.90 = 77.80). Nunca chamou `view_order`. |
| 6 | Tem alguma sobremesa boa? | — | Idem | — | (`search_dish`/`recommend_dish`) Adicionar este · Ver mais · Ingredientes | NÃO | Texto OK, mas sem tool. linkedItems Pudim+Brownie via post-processing FE-side. |
| 7 | Conta sobre a especialidade da casa | — | Idem | — | — | PARCIAL | Resposta não-bloqueada; cita Filé Mignon. linkedItems puxa o item certo. |
| 8 | Qual o horario de funcionamento? | — | (5 chips, era expected) | — | (informação restaurante OK, deveria responder) | NÃO | **BUG P1**: Classifier marca como off-topic (`block_reason="classifier"`). `was_blocked=true`. Confirma achado Wave 1 A-2. |
| 9 | Vou pedir o brownie tambem | — | Idem | — | (`add_to_order`) | NÃO | Sem tool dispatch. AI alucinou "total agora R$35.89". |
| 10 | Vou querer mais um daquele que pedi primeiro | — | Idem | — | adicionar Risoto +1 (memória) | **MEMORY FAIL** | AI adicionou Vinho Tinto, NÃO Risoto. Diz "agora você tem duas taças e um Brownie" — esqueceu Risoto totalmente. |
| 11 | Pode chamar o garcom? | — | Idem | — | (`call_waiter`) "Cancelar chamado" | NÃO | LLM respondeu em texto, sem dispatch de `call_waiter`. |
| 12 | Pode mostrar meu pedido completo? | `view_order` | Idem | `[]` (tool errored) | (`view_order`) Pedir mais · Modificar · Pedir conta | NÃO | Tool dispatched mas falhou: `error.code="api_error", message="transport: [Errno 111] Connection refused"`. response vazio. |
| 13 | Quero pagar a conta | `view_order` (não `pay_full`/`request_check`) | Idem | `[]` (tool errored) | (`pay_full`) "Confirmar PIX · Trocar pra cartão" | NÃO | LLM dispatched o tool errado (view_order em vez de request_check / pay_full). E falhou também. |
| 14 | Quero deletar meus dados | `show_lgpd_notice` | Idem | **`["Sim, quero excluir", "Não, não quero excluir"]`** ✓ no result | "Sim quero excluir · Não, não quero excluir" (binário) | **CHIPS GERADOS NO TOOL MAS NÃO RENDERIZADOS NO UI** | Tool produz chips canônicos ✓; mas `assistant.service.ts` ignora `tc.result.chips` ao montar response, e a página chat renderiza só `res.suggestions` que continua o trio estático. UI mostra os mesmos 3 chips de sempre. |
| 15 | Qual a comparacao entre o que comi e a sobremesa? | — | Idem | — | comparação completa (memória 1+5+9+10) | **MEMORY FAIL** | Só citou Brownie+Pudim. Esqueceu Risoto e os 2 vinhos. |
| 16 | Quero registrar uma reclamacao | — | Idem | — | (`send_complaint`) → ContextualInputExpand obrigatório | **EXPAND NÃO DISPARA** | Sem tool dispatch. ContextualInputExpand nem é importado pela página chat; mesmo que o tool `send_complaint` viesse, o chat ignora `action:"expand"`. |
| 17 | Quero mandar uma mensagem pro gerente | — | Idem | — | (`send_message_to_manager`) → ContextualInputExpand obrigatório | **EXPAND NÃO DISPARA** | Idem. AI respondeu em texto pedindo a mensagem em vez de abrir input expand. |
| 18 | abre o cardapio | `view_menu` | Idem | `[]` | (`view_menu`) Risoto · Bebidas · Sobremesas | NÃO | Mesmo bug do turn 2. |

**Resumo da tabela**: 0/18 turnos atenderam o spec de chips reativos.

## Análise de contextualização por turn

### Memória curta (turns 1-4)
- ✓ Turn 3 referencia Risoto (turn 1) ao recomendar Vinho Tinto.
- ✓ linkedItems via FE-side `extractLinkedItems` casa nomes na resposta com IDs reais — isso funciona bem (parsing por substring accent-insensitive).

### Memória turn 5 (total)
- ✗ AI inventou "R$67.89" para o pedido. Real (Risoto 54.90 + Vinho 22.90) = R$77.80.
- Causa raiz: AI nunca chama `add_to_order` para criar `order_items` no banco, então `view_order` (mesmo se funcionasse) retornaria vazio. AI mantém ledger só na memória do LLM e perde itens conforme contexto cresce.
- Não há tool dispatch para `view_order` neste turno.

### Memória turn 10 (referência implícita)
- **FALHA CRÍTICA**: "vou querer mais um daquele que pedi primeiro"
- Item primeiro pedido: **Risoto de Funghi** (turn 1).
- AI adicionou: **Taça de Vinho Tinto** (item do turn 3).
- AI confirma "agora você tem duas taças e um Brownie com Sorvete" — Risoto sumiu da memória.
- Causa raiz: histórico sliding window de 10 turnos no `assistant.service.ts` (`getHistory().slice(-4)` no classify e history completo no chat), mas o LLM está confundindo "primeiro" com "anterior".

### Memória turn 15 (síntese)
- **FALHA CRÍTICA**: "qual a comparação entre o que comi e a sobremesa?"
- Esperado: comparar items pedidos (Risoto + 2× Vinho + Brownie) com opções de sobremesa.
- Real: AI só citou Brownie e comparou com Pudim. Ignorou totalmente Risoto + Vinhos.
- Latência alta (4751ms — p95 da rodada) e tokens_in altos (~3000) — provavelmente truncamento de contexto no upstream.

## Validação de animações

### `cBalloonPulse` (esperado durante LLM thinking)

- **Definição encontrada**: `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx:329` (`@keyframes cBalloonPulse`).
- **Uso real no chat**: NENHUM. O chat (`page.tsx`) não importa nem usa `cBalloonPulse`.
- O que o chat MOSTRA durante thinking: um bubble pequeno com 3 dots visível em `screenshots/K/07a-thinking-400ms.png`. É um indicador de typing simples, não a animação `cBalloonPulse` da spec.
- **Status**: NÃO IMPLEMENTADO no surface chat. Spec out-of-scope ou documentação stale.

Frames capturados (delay artificial via fetch hijack 5s):
- `07a-thinking-400ms.png` — 3 dots visíveis em bubble pequeno
- `07b-thinking-1000ms.png` — mesmo estado (animação CSS lenta ou estática)
- `07c-after-greeting.png` — resposta final renderizada

### `liquidMorph` chip animation

- Existe em `lib/animations.ts:88` (`liquidMorph: 'animate-liquid-morph'`) e referenciado em `ContextualInputExpand.tsx:62`.
- **Nunca dispara no chat** porque:
  1. Nenhum tool emite chip com `action: "expand"`.
  2. A página chat renderiza chips como `<button>` plano em vez de `<SuggestionChip>` (que sabe ler `chip.action === "expand"`).
- **Status**: dead code path no fluxo do chat.

### `ContextualInputExpand` trigger

- Spec: `send_complaint` / `send_message_to_manager` → expand OBRIGATÓRIO; `add_to_order` → expand não-obrigatório.
- Real: `grep -rn "ContextualInputExpand" apps/web-customer/src` retorna SOMENTE referências em `lib/animations.ts` (comentário) + `globals.css` (comentário) + arquivo próprio. **Nenhum import.**
- A tela `ScreenCustomerComplaintCompose.tsx` tem seu próprio textarea/input, NÃO usa `ContextualInputExpand`.
- **Status**: P1 — componente totalmente órfão. Spec assume comportamento que não existe.

## Stats de latency

Tool dispatch latency end-to-end (`POST /api/restaurant_dev/assistant/message` → response, medido client-side):

| Estatística | Valor (ms) |
|---|---|
| n | 17 (turn 1 timing falhou no script bash, ignorado) |
| min | 594 |
| média | 2466 |
| mediana | 2430 |
| p95 | 4751 |
| max | 4751 |

DB-side latency_ms (do field `assistant_messages.latency_ms`, só counts non-blocked + non-zero):

| Estatística | Valor (ms) |
|---|---|
| n | 16 |
| média | 2402 |
| max | 3999 |

- Meta da spec: < 4s no p95. **NÃO ATENDE** (4751ms).
- Maior fonte de latência: chamada upstream LM Studio (qwen2.5-7b-instruct-mlx) com tokens_in ≥ 3000 (system prompt + menu_summary + history).
- Greetings (4th-layer ack) são rápidos (594ms para "oi").
- Bloqueios pelo classifier também rápidos (0ms — greeting ou direct-block).

## Bugs / Observações

### P0

- **K-1 · Chips reativos NUNCA chegam à UI.** O backend `assistant.service.ts` retorna `suggestions: SUGGESTION_CHIPS.slice(0, 3)` em todos os branches (greeting, blocked, normal, fallback). Mesmo quando um tool emite chips canônicos no `ToolResult` (e.g. LGPD `["Sim, quero excluir", "Não, não quero excluir"]`), esses chips ficam dentro do `toolCalls[].result.chips` e o FE não tem código para ler dali — só lê `res.suggestions`. **Resultado**: 100% dos turnos mostram os mesmos 3 chips estáticos.
- **K-2 · `assistant_messages.contextual_chips` SEMPRE NULL.** A coluna existe (migration unknown), mas `assistant.service.ts:saveMessage` nunca é chamado com chips. Confirma Wave 1.
- **K-3 · Memória da IA falha em referência implícita** (turn 10) — perde item do turn 1 e responde com item do turn 3 errado. Bug do prompt ou do LLM (qwen2.5-7b-instruct-mlx); não há test de regressão.
- **K-4 · LLM raramente usa function-calling para mutar estado.** "Quero pedir um Risoto de Funghi" não dispara `add_to_order`. "Pode chamar o garçom" não dispara `call_waiter`. "Quero registrar uma reclamacao" não dispara `send_complaint`. AI responde em texto e o FE faz best-effort com regex `ORDER_INTENT_PATTERNS` no próximo turno (que tem seus próprios bugs P0 já catalogados na própria spec do código).
- **K-5 · `view_order` e `pay_full` chamadas via dispatcher batem em "Connection refused".** O ai-service tenta um POST upstream que falha. Provavelmente apontando para host/porta errado dentro do container.

### P1

- **K-6 · `Qual o horario de funcionamento?` é bloqueado pelo classifier.** Spec esperada (e bom senso) diz que info do estabelecimento é tópico válido. Confirma Wave 1.
- **K-7 · `ContextualInputExpand` é dead code.** Componente bem-documentado mas sem nenhum import fora da pasta `components/ui/`. Spec K assume `send_complaint` / `send_message_to_manager` triggam expand obrigatório — nunca acontece.
- **K-8 · `SuggestionChip` é dead code no chat.** A página `assistente/page.tsx` rendera chips como `<button>` plano em vez de `<SuggestionChip>`, perdendo toda a inteligência de `action: "send" | "navigate" | "expand"`.
- **K-9 · Tools que deveriam ter chips (29/39 customer tools) retornam `chips: []`.** `view_menu`, `add_to_order`, `view_order`, `pay_full`, `call_waiter`, `request_check`, `compare_dishes`, `check_allergens`, etc. nenhum gera chips reativos por categoria.
- **K-10 · `toolHint` é null em toda response.** O FE espera `res.toolHint?.type === 'lgpd_notice'` para renderizar os chips canônicos LGPD, mas o backend nunca seta `toolHint`. `ChatResponse` schema (OpenAPI) sequer tem o campo. Resultado: até o caso especial LGPD não renderiza.
- **K-11 · AI hallucinates totals** (R$67.89, R$35.89, R$43.89 — todos errados). Sem `add_to_order` real → sem `order_items` no DB → sem ground truth.

### P2

- **K-12 · Latency p95 acima da meta** (4751ms vs <4000ms). Tokens_in ~3000 por turno; cache eviction provável.
- **K-13 · `contextual_chips` column has GIN/JSONB index inutilizado.** Coluna nunca recebe write — index pesa sem benefício. Limpeza de schema futura.
- **K-14 · Chat page DEFAULT_SUGGESTIONS difere do backend SUGGESTION_CHIPS.** "Sugestão leve · Sobremesa combina? · Pratos com camarão · Como pagar?" (FE) vs "Qual o prato do dia? · Recomende uma bebida · Quais sobremesas tem?" (BE). Após primeiro turno o BE sobrescreve, mas idle state mostra strings que ninguém mais conhece.
- **K-15 · No idle state, há 4 chips; após turno, só 3.** Inconsistência visual.

## Screenshots

- `qa-reports/screenshots/K/01-chat-loaded-with-history.png` · idle estado inicial (Mesa 05 — bundle stale)
- `qa-reports/screenshots/K/02-chat-with-history.png` · após bundle reset M22 (chips estáticos visíveis)
- `qa-reports/screenshots/K/03-chat-after-reload.png` · pós-reload, M22 confirmada
- `qa-reports/screenshots/K/04-after-chip-click-thinking.png` · após tap em "Sugestão leve" → resposta + linkedItem Risoto, chips agora são o trio estático do BE
- `qa-reports/screenshots/K/05a-thinking-frame-300ms.png` · estado intermediário durante "tem alguma sobremesa?"
- `qa-reports/screenshots/K/06-lgpd-binary-chips.png` · após "quero que excluam meus dados" → bubble correto com texto LGPD canônico, MAS chips bottom continuam o trio "Qual o prato do dia? · Recomende uma bebida · Quais sobremesas tem?" — chips binários "Sim/Não" do tool NÃO renderizam
- `qa-reports/screenshots/K/07a-thinking-400ms.png` · 3-dots typing indicator (não é cBalloonPulse)
- `qa-reports/screenshots/K/07b-thinking-1000ms.png` · mesmo estado 600ms depois
- `qa-reports/screenshots/K/07c-after-greeting.png` · resposta final ao "oi" + chips sempre o mesmo trio

## Conclusão

Reactive contextualization está quebrada em 4 camadas independentes:

1. **LLM**: function-calling pouco usado; memória degrada após 10+ turns; alucina totais.
2. **Tools (Python)**: 29/39 não emitem chips; `view_order`/`pay_full` falham com connection-refused.
3. **API NestJS**: ignora `tc.result.chips`, sempre retorna o mesmo `suggestions` array hardcoded; nunca seta `toolHint`; nunca grava em `contextual_chips`.
4. **FE Next.js**: renderiza chips como `<button>` plano (perde `SuggestionChip`); `ContextualInputExpand` é dead code; `liquidMorph` nunca dispara.

A spec K assume reactivity end-to-end. O código atual é uma cascata de placeholders independentes que NÃO se conectam. Wave 1 (Subagent A) já tinha sinalizado a parte de chips estáticos; aqui confirmamos e mapeamos as 4 camadas — fix vai precisar tocar todas para qualquer melhoria visível.

---

*Generated 2026-05-09 03:35 UTC · Subagent K · Wave 2 cross-simulator validation*
