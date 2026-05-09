# E2E Cross-Sim · Subagent A · Onboarding + Discovery

**Status**: PARCIAL com 4 bugs P1 críticos · 3 P2 menores · 1 P3 cosmético
**Wave**: 1
**Data execução**: 2026-05-09 03:00 → 03:09 UTC (~9 min)

---

## TL;DR

Sequência de 15 passos rodada parcialmente. Fluxo de onboarding, recognition e
6 prompts de discovery executaram com respostas plausíveis e `linkedItems`
corretos, MAS os contratos centrais do spec falham:

- **`tool_calls` SEMPRE NULL** — qwen2.5-7b NÃO emite tool_calls em nenhum dos
  6 prompts. Esperado: 6 rows com tools distintas (`view_menu`, `search_dish`,
  `check_allergens`, `compare_dishes`, `recommend_dish`, `ask_about_restaurant`).
  Realidade: 0 tools registrados em `assistant_messages.tool_calls` (P1).
- **`contextual_chips` SEMPRE NULL** — chips persistidos no DB nunca, apesar
  da response trazer `suggestions[]` no payload (P1).
- **CPF do Pedro `55522266677` é inválido pelo algoritmo BR** — o WelcomeModal
  rejeita o submit. Onboarding "happy path" via formulário fica BLOQUEADO.
  Auto-recognize via `recognition_token` cookie funcionou como workaround (P1).
- **`ask_about_restaurant` (horários) classificado como off-topic** —
  guardrail do classifier bloqueia "até que horas vocês ficam abertos?" e
  retorna mensagem genérica em vez de invocar a tool (P1).
- **Mongo persistence NÃO acontece no fluxo do assistente** — collection
  `chat_messages` ficou em 2 docs total (de outros customers), Pedro = 0.
  Spec passo 14 espera ≥12 (6 user + 6 assistant). Mismatch entre spec e
  código atual (P2; pode ser drift documental).

Apesar dos bugs, contextualização cross-tool **PASSOU**: prompt "vou querer
aquele que você recomendou" devolveu Risoto de Funghi (item recomendado no
turn anterior).

---

## Cenário

Customer Pedro Silva escaneia QR da mesa M05, completa onboarding e dispara
6 prompts de descoberta cobrindo cada uma das 6 tools mandatórias do spec
(`view_menu`, `search_dish`, `check_allergens`, `compare_dishes`,
`recommend_dish`, `ask_about_restaurant`). Validamos tool_calls, chips,
linkedItems, latência e contextualização cross-tool.

## Setup real usado

| Recurso | Valor |
|---|---|
| Sim 1 | iPhone 15 Pro · `ECCA308F-F4AA-4647-ADCF-0BE1F6A9F9D4` |
| Slug tenant | `restaurant_dev` |
| Mesa | M05 (id `55b2caa9-ff99-4b8e-bf00-b1e8918bad86`, label "Mesa 05 (Varanda)") |
| Customer | Pedro Silva (id `76e0565a-9f80-4c89-b008-4ae0be07d095`, recognition_token `1012390c-cb53-4456-8487-24c37849f887`) |
| API base | `http://localhost:3001/api` |
| Web-customer | `http://localhost:3003/restaurant_dev/mesa/M05` |
| AI service | `http://localhost:8000` (qwen2.5-7b-instruct-mlx, 46 tools registered) |
| Postgres | port 5434, schema `restaurant_dev` |
| Mongo | `restaurant_chat` DB |
| Driver | Playwright Chromium (393×852 viewport) + iOS sim screenshots paralelos |

**Por que não Safari iOS direto**: Safari iOS no simulador, em modo browser (tier "read"),
não expõe DOM via accessibility hierarchy — só o chrome do app. Para drive E2E,
usei Playwright Chromium com viewport iPhone 15 Pro (393×852) batendo nos mesmos
endpoints, e capturei screenshots iOS em paralelo via `xcrun simctl io` para
evidência visual (`08-ios-final.png` mostra WelcomeModal idêntica no sim 1).

## Sequência observada

| # | Time (UTC) | Device | Ação | Resultado |
|---|---|---|---|---|
| 1 | 03:00:27 | sim 1 + Playwright | Open URL signed `mesa/M05?hmac=…&ts=…` | Page render OK, `/session/init` 201, sessionId `bdfaa542…` |
| 2 | 03:00:28 | Playwright | WelcomeModal aparece com "Bem-vindo ao Meu Restaurante" + campos Nome/CPF | OK (texto difere do spec mas core intent preservado) |
| 3 | 03:00:33 | Playwright | Type "Pedro" em Nome, "55522266677" em CPF | Campos preenchidos, formato auto: "555.222.666-77" |
| 3a | 03:00:34 | Playwright | Tentar clicar "Continuar" | **FALHOU**: button disabled. Investigação: CPF reprovado pelo algoritmo BR (digit1 esperado=6, recebido=7; digit2 esperado=8, recebido=7). Igual em 4 outros customers seedados. |
| 3b | 03:01:50 | Playwright (workaround) | POST `/customer/recognize` com body `{recognitionToken: '1012390c…'}` | 201, customer Pedro reconhecido (totalVisits=2, isReturning=true) |
| 4 | 03:02:04 | Playwright | Reload mesa M05 | Cookie `recognition_token` agora setado pelo backend → auto-recognize → Home renderiza "Olá, Pedro Silva!" |
| 4a | 03:02:10 | DB | Validar `table_sessions` | session `bdfaa542…` ACTIVE, host=Pedro, flags={}, participant Pedro APPROVED ✓ |
| 5 | 03:02:11 | Playwright | Conferir chips iniciais | Renderiza apenas 2 PillButtons ("Chamar garçom", "Ver cardápio"). NÃO 4 chips contextuais como spec sugere. NÃO há chips banidos. |
| 6 | 03:02:38 | Playwright | Type "abrir cardápio" → submit | Navega para `/assistente?prefill=…`, primeira request 503 (timeout classify). Segunda: 201 com response livre + 4 linkedItems. **`tool_calls` NULL no DB**. Latência: 6.8s. |
| 6a | 03:03:09 | DB | `SELECT tool_calls FROM assistant_messages` | NULL para "abrir cardápio". Spec exige `view_menu`. ✗ |
| 7 | 03:03:46 | Playwright | Type "tem algum risoto?" → submit | 201, response menciona Risoto de Funghi (R$ 54,90), 1 linkedItem. **`tool_calls` NULL**. Latência: 0.9s. |
| 7a | 03:03:47 | DB | `SELECT tool_calls` | NULL. Spec exige `search_dish`. ✗ |
| 8 | 03:07:08 | curl/fetch | "esse Risoto de Funghi tem lactose?" | 201, response: "O Risoto de Funghi não contém lactose. Gostaria de pedir esse prato?". 1 linkedItem. **`tool_calls` NULL**. Latência: 1.5s. Spec exige `check_allergens`. ✗ |
| 9 | 03:07:12 | curl/fetch | "qual a diferença entre o risoto e o nhoque?" | 201, comparação textual em bullets ("Risoto de Funghi… cremosa e saborosa" vs "Nhoque ao Sugo… molho de tomate fresco"). 2 linkedItems. **`tool_calls` NULL**. Latência: 4.0s. Spec exige `compare_dishes`. ✗ |
| 10 | 03:07:16 | curl/fetch | "o que você recomenda pra hoje?" | 201, recomenda **Risoto de Funghi** + **Picanha na Brasa**. 2 linkedItems. **`tool_calls` NULL**. Latência: 3.0s. Spec exige `recommend_dish`. ✗ |
| 11 | 03:07:17 | curl/fetch | "até que horas vocês ficam abertos?" | 201 mas `was_blocked=true`. Response: "Desculpe, só posso ajudar com assuntos do restaurante…" — classifier bloqueou OFF-TOPIC. Spec exige `ask_about_restaurant`. ✗✗ Severo. |
| 12 | 03:07:30 | — | Aguarda 30s, observa chips persistirem | Suggestions estáticas (mesmas 3 chips em todas as turns: "Qual o prato do dia?", "Recomende uma bebida", "Quais sobremesas tem?"). NÃO contextuais. Persistem ✓ mas valor ✗. |
| 13 | 03:08:45 | curl | "vou querer aquele que você recomendou" | 201, response: "Ótima escolha! Vou sugerir o **Risoto de Funghi**…" — IA LEMBROU corretamente da sugestão prévia. Latência: 2.8s. **Contextualização cross-tool: PASS**. |
| 14 | 03:08:46 | DB | `db.chat_messages.countDocuments({customerId:'76e0565a…'})` | **0 docs** no Mongo. Postgres tem 11. Mongo persistence NÃO ocorre no fluxo de assistente. ✗ |
| 15 | 03:08:50 | DB | `SELECT tool_name, COUNT(*) FROM assistant_messages WHERE tool_calls IS NOT NULL` | **0 rows**. Spec esperava 6 rows distintas. ✗✗✗ |

## Validação DB/WS (queries usadas)

### Postgres — sessão e participants (passo 4)

```sql
SELECT id, status, host_customer_id, flags, created_at
FROM restaurant_dev.table_sessions
WHERE table_id='55b2caa9-ff99-4b8e-bf00-b1e8918bad86' AND status IN ('open','active')
ORDER BY created_at DESC LIMIT 1;
```
Output:
```
id              | bdfaa542-f07a-4b34-a1e4-06639cbddb99
status          | active
host_customer_id| 76e0565a-9f80-4c89-b008-4ae0be07d095  ← Pedro = host ✓
flags           | {}
created_at      | 2026-05-09 02:59:38.8801+00
```

```sql
SELECT customer_id, status, joined_at
FROM restaurant_dev.session_participants
WHERE table_session_id='bdfaa542-f07a-4b34-a1e4-06639cbddb99';
```
Output:
```
customer_id | 76e0565a-9f80-4c89-b008-4ae0be07d095
status      | approved  ← ✓
joined_at   | 2026-05-09 03:02:04.113989+00
```

### Postgres — assistant_messages (passos 6-13)

```sql
SELECT user_message, tool_calls IS NOT NULL AS has_tools,
       contextual_chips IS NOT NULL AS has_chips, was_blocked, latency_ms
FROM restaurant_dev.assistant_messages
WHERE customer_id='76e0565a-9f80-4c89-b008-4ae0be07d095'
ORDER BY created_at DESC LIMIT 11;
```
Output (tabela completa):

| user_message | has_tools | has_chips | was_blocked | latency_ms |
|---|---|---|---|---|
| vou querer aquele que você recomendou | f | f | f | 2810 |
| até que horas vocês ficam abertos? | f | f | **t** | 0 |
| o que você recomenda pra hoje? | f | f | f | 3021 |
| qual a diferença entre o risoto e o nhoque? | f | f | f | 3993 |
| esse Risoto de Funghi tem lactose? | f | f | f | 1536 |
| tem algum risoto? | f | f | f | 946 |
| abrir cardápio | f | f | f | 6802 |
| esse Risoto de Funghi tem lactose? | f | f | f | 1163 |
| tem algum risoto? | f | f | f | — |
| abrir cardápio | f | f | f | — |
| abrir cardápio | f | f | f | — |

`has_tools = false` em **TODAS** as 11 mensagens. `has_chips = false` em todas.

```sql
SELECT tool_calls->0->'function'->>'name' AS tool, COUNT(*)
FROM restaurant_dev.assistant_messages
WHERE customer_id='76e0565a-9f80-4c89-b008-4ae0be07d095' AND tool_calls IS NOT NULL
GROUP BY 1;
```
Output: `(0 rows)` — esperado 6.

### Mongo (passo 14)

```js
db.chat_messages.countDocuments({customerId:'76e0565a-9f80-4c89-b008-4ae0be07d095'})
```
Output: `0` — esperado ≥12.

```js
db.chat_messages.countDocuments({})  // total
```
Output: `2` — apenas 2 docs de outro customer (`6ba380ae-…`) gravados anteriormente
via fluxo de LGPD. Confirmado em código:
`apps/api/src/modules/chat-history/chat-history.service.ts` é usado APENAS por
`lgpd.service.ts`, NÃO por `assistant.service.ts`.

### AI service tool dispatch (logs)

```bash
docker logs restaurant-ai --since "5m" | grep -iE "tool_calls|dispatched"
```
Output: vazio. Nenhum tool dispatch saiu do `/chat` endpoint durante esses 6
prompts. Confirmação dupla de que qwen2.5-7b não está emitindo `tool_calls`.

`/tools/dispatch` foi chamado várias vezes pelo `/continuation` e
`/smart-suggestions`, mas isso é o caminho de chips de continuação — NÃO o
caminho mandatório do spec.

## Tools invocadas + tool_calls populados em `assistant_messages`

| # | Spec tool | Prompt | tool_calls populado? | linkedItems? | Resposta plausível? |
|---|---|---|---|---|---|
| 1 | `view_menu` | "abrir cardápio" | **NÃO** | sim (4) | sim |
| 2 | `search_dish` | "tem algum risoto?" | **NÃO** | sim (1, Risoto de Funghi) | sim |
| 3 | `check_allergens` | "esse Risoto de Funghi tem lactose?" | **NÃO** | sim (1) | sim — "não contém lactose" (correto, ingredients=arroz/funghi/parmesao/manteiga não lista lactose) |
| 4 | `compare_dishes` | "qual a diferença entre o risoto e o nhoque?" | **NÃO** | sim (2) | sim — bullets comparando |
| 5 | `recommend_dish` | "o que você recomenda pra hoje?" | **NÃO** | sim (2: Risoto+Picanha) | sim |
| 6 | `ask_about_restaurant` | "até que horas vocês ficam abertos?" | **NÃO** (e was_blocked=t) | não | **NÃO** — classifier bloqueou como off-topic |

**Resultado**: 0/6 tools invocadas via `tool_calls` jsonb. linkedItems vem de
`extractLinkedItems()` no API service que faz regex sobre o texto da resposta —
não é equivalente a tool dispatch.

## Chips contextuais observados após cada bubble

Todos os turnos retornaram a mesma tripla estática:

```
["Qual o prato do dia?", "Recomende uma bebida", "Quais sobremesas tem?"]
```

Exceção: o turno bloqueado ("até que horas") retornou 5 chips genéricas:
```
["Qual o prato do dia?", "Recomende uma bebida", "Quais sobremesas tem?",
 "Opções sem glúten", "Mais pedidos do restaurante"]
```

NÃO há contextualização (nenhuma chip referenciou risoto, nhoque, lactose,
funghi etc., apesar dos turnos prévios). NÃO há chips banidos ("Ok", "Sim").
NÃO foram persistidos no DB (`contextual_chips` jsonb=NULL).

## Bugs encontrados

### P1 #1 — Seed CPFs inválidos pelo algoritmo BR (BLOQUEIA onboarding)

**Severidade**: P1 (bloqueia happy-path do flow A; afeta 5 dos 6 customers seed).

**Repro**:
1. Mesa M05 com Pedro CPF `55522266677` (per `qa-reports/SIM-ALLOCATION.md`).
2. Página renderiza WelcomeModal.
3. Type "Pedro" em Nome, "55522266677" em CPF.
4. Botão "Continuar" fica permanentemente disabled.

**Diagnóstico**:
`apps/web-customer/src/lib/cpf.ts:validateCpf()` calcula DV1=6, DV2=8;
o CPF informado tem DV1=7, DV2=7 → `isCpfValid = false` → `canSubmit = false`.
A API também valida no backend (`apps/api/src/modules/customers/cpf.util.ts`).

**Validação algorítmica de todos os seed CPFs** (rodado por script no relatório):
| Customer | CPF | Algoritmo BR |
|---|---|---|
| Ana Pereira | 11144477735 | **VALID** |
| Bruno Pacheco | 22255588801 | INVALID |
| Carla Mendes | 33399922200 | INVALID |
| Diego Vargas | 44411155566 | INVALID |
| Pedro Silva | 55522266677 | INVALID |
| Eduardo Vargas | 66633377788 | INVALID (mas spec exige NÃO existir) |

**Workaround usado**: POST `/customer/recognize` direto com `recognitionToken` da DB.
Isso seta o cookie httpOnly e o reload-da-mesa entra em auto-recognize, pulando
o WelcomeModal. Funciona, mas não é o caminho que um usuário real percorre.

**Impacto cascata**: Subagentes B (Carla), C, E (Eduardo cadastro novo), F, G,
H, I, J, K, L, M (todos exceto N) que dependem de WelcomeModal vão bater no
mesmo bloqueio. **Recomendação**: regenerar seeds com CPFs algorithmically válidos
(ex.: gerador online → atualizar `SIM-ALLOCATION.md`).

**Evidência**: `qa-reports/screenshots/A/03-welcome-filled.png` (botão Continuar disabled após preenchimento).

---

### P1 #2 — `tool_calls` jsonb permanece NULL em 100% das messages

**Severidade**: P1 (regression descrito em spec line 391).

**Repro**:
1. Pedro autenticado em M05.
2. POST `/api/restaurant_dev/assistant/message` com qualquer um dos 6 prompts.
3. Conferir Postgres: `SELECT tool_calls FROM restaurant_dev.assistant_messages WHERE customer_id=…`.

**Esperado**: jsonb populado no formato OpenAI `[{"id":..., "type":"function", "function":{"name":"view_menu", "arguments":"…"}, "result":{...}}]`.
**Observado**: NULL em todas as 11 rows do Pedro.

**Diagnóstico**:
- API (`apps/api/src/modules/assistant/assistant.service.ts:255`) passa
  `result.tool_calls` para `saveMessage()` com correta migração 029.
- AI service (`services/ai-service/main.py:305-310`) chama
  `provider.chat(messages=…, tools=get_tool_schemas())` — tools forwardados.
- AI service espera `result.get("tool_calls")` no provider response.
- LM Studio + qwen2.5-7b-instruct-mlx não está emitindo `tool_calls`. Possíveis causas:
  - Provider OpenAI-compat do LM Studio pode estar truncando `tool_calls` no parse;
  - Modelo qwen2.5-7b é fraco em tool-calling em pt-BR (especialmente quando o prompt em pt já induz uma resposta natural);
  - System prompt induz o modelo a responder em texto livre antes de considerar tools.

**Sintoma colateral**: `linkedItems` aparece corretamente no payload porque
`extractLinkedItems()` em `assistant.service.ts:258` faz regex sobre o texto da
resposta procurando nomes de menu_items — bypass válido para UX mas não atende
ao contrato de auditabilidade do spec.

**Próximos passos sugeridos**:
1. Verificar logs do LM Studio com `tools` payload (curl direto no OpenAI endpoint).
2. Testar com `tool_choice: "required"` ou `"auto"` na chamada do provider.
3. Avaliar trocar pra modelo com tool-calling mais robusto (qwen3 ou nemotron).

---

### P1 #3 — `ask_about_restaurant` (horários) classificado como off-topic

**Severidade**: P1 (1 das 6 tools mandatórias do flow A simplesmente não funciona).

**Repro**:
1. Pedro autenticado.
2. POST com `message="até que horas vocês ficam abertos?"`.
3. Resposta: `"Desculpe, só posso ajudar com assuntos do restaurante: cardápio, pratos, bebidas, recomendações e informações sobre o estabelecimento."`. `was_blocked=true`.

**Diagnóstico**: o classifier (provavelmente em `services/ai-service/src/classifier.py`
ou similar) considerou "horários" como off-topic, apesar de horários do restaurante
ser informação sobre o ESTABELECIMENTO. Inconsistência: a próprio resposta de
bloqueio diz "informações sobre o estabelecimento" mas blocou exatamente isso.

**Impacto**: tool `ask_about_restaurant` é inacessível via prompts naturais sobre
horários, endereço, telefone, formas de pagamento etc.

---

### P1 #4 — `contextual_chips` jsonb NUNCA populado + chips estáticas

**Severidade**: P1.

**Repro**: ver tabela acima — `has_chips=false` em todas as 11 mensagens.

**Diagnóstico**: `assistant.service.ts:208,224,263,277` retorna chips do array
estático `SUGGESTION_CHIPS.slice(0,3)` em vez de gerar dinâmicas baseadas em
contexto/intent. A coluna `contextual_chips` no Postgres existe (migration ok)
mas nunca recebe insert. `assistant.service.ts` em `saveMessage()` provavelmente
não passa `contextual_chips`.

**Verificação rápida**:
```bash
grep -n "contextual_chips\|contextualChips" apps/api/src/modules/assistant/assistant.service.ts
```
Não há referência — a coluna está orfã.

---

### P2 #5 — Mongo `chat_messages` não recebe inserts do flow de assistente

**Severidade**: P2 (pode ser drift do spec; se feature foi removida intencionalmente, atualizar spec).

**Repro**: passo 14 acima. `db.chat_messages.countDocuments({customerId:'76e0565a…'})=0`.

**Diagnóstico**: `ChatHistoryService` só é injetada em `lgpd.service.ts`. O
`AssistantService` grava só no Postgres (`assistant_messages`). Spec line 372-373
prevê 12+ docs (6+6) — incompatível com código atual.

**Decisão**: ou (a) reativar dual-write no AssistantService → ChatHistoryService,
ou (b) atualizar spec pra refletir Postgres-only. Não tenho contexto pra decidir
qual é o behavior desejado.

---

### P2 #6 — Customer state perdido em navegação cross-route

**Severidade**: P2.

**Repro**:
1. Pedro autenticado, em `/restaurant_dev/mesa/M05`.
2. Navegar pra `/restaurant_dev/assistente?customerId=…`, submeter prompt.
3. Em alguns retornos do session, a navegação encerra em `/restaurant_dev/eu` mostrando "Você ainda não se identificou nesta visita."

**Diagnóstico**: o `session:bundle` em sessionStorage foi sobrescrito por outro
processo (provavelmente o Subagent N rodando em paralelo no mesmo browser).
Não é um bug isolado de A — é coordenação de testes paralelos. Mas indica
fragilidade no isolamento de sessão entre tabs/janelas.

---

### P2 #7 — Latência de primeira chamada excede budget (6.8s vs 4s spec)

**Severidade**: P2 (degrada UX no first-message).

**Repro**: ver tabela latência. "abrir cardápio" levou 6.8s.

**Diagnóstico**: provavelmente cold-start do LM Studio ou primeira inferência
com `tools=[…]` paga overhead alto. Subsequent calls: 0.9-4.0s. Sugestão:
warm-up call no startup do AI service ou cache de embeddings de tools.

---

### P3 #8 — Spec copy ≠ UI real

**Severidade**: P3 (cosmético/documental).

| Spec passo | Texto esperado | Texto real |
|---|---|---|
| 2 | "Olá! Bem-vindo. Identifique-se" | "Bem-vindo ao Meu Restaurante" + "Para personalizar sua experiência, informe seu nome e CPF." |
| 5 | "saudação personalizada 'Olá Pedro' + chips iniciais" | "Oi, Pedro Silva! Preparamos tudo com carinho…" + 2 PillButtons (sem chips) |

Não é bug funcional; só atualizar o spec para refletir o copy atual.

## Screenshots críticos

Em `qa-reports/screenshots/A/`:

- `01-after-scan-qr.png` — sim 1 sem HMAC (mostra "QR Code invalido"), justifica geração da URL signed
- `02-welcome-modal.png` — sim 1 (iOS Safari) com WelcomeModal carregada
- `03-welcome-filled.png` — Playwright Chromium com nome/CPF preenchidos e Continuar disabled (evidência P1 #1)
- `04-home-recognized.png` — Home pós-recognize com "Olá, Pedro Silva!"
- `05-step6-view-menu.png` — chat após "abrir cardápio" mostrando linkedItems
- `06-step7-search-risoto.png` — bubble com Risoto de Funghi card
- `07-page-state.png` — `/eu` page sem customer (evidência P2 #6)
- `08-ios-final.png` — final iOS sim 1, WelcomeModal idêntica em viewport real

## Blockers e diagnósticos

### Blocker #1 (resolvido com workaround) — CPF inválido

Resolvi via `recognitionToken` cookie path. Subagentes seguintes precisam do
mesmo workaround OU dos seeds corrigidos.

### Blocker #2 (não resolvido) — qwen2.5 não emite tool_calls

Bloqueia validação central do spec. Workaround para o teste foi documentar a
ausência. Para destravar de fato, requer ajuste no provider/system_prompt/modelo.

### Blocker #3 (parcial) — Browser único compartilhado entre subagentes

A playwright session foi sequestrada por outro subagent (provavelmente N) em
03:08. Mitiguei usando curl direto. Sugestão coordenação: cada subagent
deveria ter seu próprio Chromium isolado.

## Resumo de cobertura

| Aspecto | Status |
|---|---|
| Onboarding (passos 1-5) | PARCIAL (bloqueado em CPF; resolvido via workaround cookie) |
| Tool dispatch (passos 6-11) | FALHOU — 0/6 tools registradas |
| Linked items (UX) | OK — 4 de 6 prompts trazem linkedItems coerentes |
| Contextualização cross-tool (passo 13) | PASS — IA lembrou da recomendação |
| Chips reativos (passo 12) | FALHOU — chips estáticas, não persistidas |
| Mongo persistence (passo 14) | FALHOU — 0 docs |
| tool_calls populated (passo 15) | FALHOU — 0 rows |

**Veredicto da rodada**: bugs P1 críticos identificados e documentados; o flow
"funciona" do ponto de vista do usuário (responses plausíveis, linkedItems
corretos, sem hallucination de menu) MAS o contrato de auditabilidade do spec
(tool_calls + chips + mongo) está completamente quebrado. Recomendo:

1. **Imediato**: regenerar seeds CPF com algoritmo BR válido.
2. **Curto prazo**: investigar por que LM Studio + qwen2.5 não emite tool_calls
   na rota `/chat`. Adicionar telemetria por turn (qual tool_choice foi enviado,
   o que voltou).
3. **Médio prazo**: reativar dual-write Mongo no AssistantService (ou atualizar
   spec); implementar `contextual_chips` dinâmicos.
4. **Coordenação**: isolar browsers entre subagentes para evitar sequestro de
   sessionStorage.
