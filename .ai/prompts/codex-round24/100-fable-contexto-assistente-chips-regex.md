# Fable / Claude Code — Contexto do assistente, chips inteligentes e regex sem LLM

Repo: `<repo>`

Antes de implementar, leia INTEIROS: `MEMORY.md` (principalmente as seções
"Decisoes de Caleb em 2026-06-11", "Bugs dos videos de 2026-06-10
corrigidos" e "Regras do fluxo de entrega consolidadas") e este prompt.
A fonte final é: MEMORY.md + este prompt + código atual. Canvas é
referência visual, não fonte absoluta.

Trabalhe em branch/worktree isolada. NÃO faça merge na main. A branch
`claude/condescending-moser-355f46` contém o trabalho mais recente
(entrega TV→garçom, ETA dinâmica, fixes do assistente/junção) — se a main
ainda não a integrou, parta dela ou da main integrada, nunca de base mais
antiga.

Regra obrigatória (igual ao prompt 99): todo botão/CTA/fluxo tem backend
real — endpoint, DTO/validação, permissão por papel, persistência, evento
WS quando afeta outra persona, erro visível na UI e teste. Nada de
`catch { setSuccess() }`, mock silencioso ou sucesso local falso. Se
faltar regra de produto, copy, permissão ou estado final: PARE e pergunte
ao Caleb antes.

Execute TUDO que está neste prompt e nas seções novas do MEMORY.md.

---

## 1. Eyebrow de status do pedido no assistente (persistente)

Hoje a faixa acima da fala da IA mostra `ASSISTENTE · DE VOLTA`/`AGORA`
(apps/web-customer/src/app/[slug]/assistente/page.tsx — procurar o render
do eyebrow da landing e dos bubbles).

Comportamento novo (decisão Caleb 2026-06-11):

- Quando a sessão tem PEDIDO ATIVO (status em
  `pending_confirmation|received|in_progress|ready|in_transit`), a eyebrow
  mostra SEMPRE, em toda visita ao assistente:
  - o TEMPO do pedido — a ETA dinâmica que já existe no backend
    (`GET /:slug/orders` devolve `eta_minutes_min`, `eta_minutes_max`,
    `queue_ahead`; formato de exibição: `14–23 MIN`, ou `~3 MIN` quando
    max ≤ 3);
  - ao lado, um PONTO/indicador com o ESTADO do pedido, com os MESMOS
    labels e cores da tela Meu pedido
    (apps/web-customer/src/app/[slug]/pedido/page.tsx → `STATUS_LABELS`
    e `STATUS_COLORS`: Recebido pela cozinha / Em preparo / Pronto para
    servir / A caminho da mesa / Entregue).
  - Exemplo: `ASSISTENTE · ● EM PREPARO · 5–9 MIN`.
- Atualiza em tempo real: o assistente já usa `useTableSocket`
  (apps/web-customer/src/hooks/useTableSocket.ts) — adicionar reação a
  `order:status`/`order:created` para refetch leve do pedido ativo (+
  fallback poll discreto). Pedido entregue/cancelado → eyebrow volta ao
  padrão atual.
- Sem pedido ativo → comportamento atual (`DE VOLTA` etc.).
- Tipografia/posição do eyebrow seguem o canon atual (mono 10px
  tracking) — só o CONTEÚDO muda. Não mexer em nada listado como locked
  no CLAUDE.md.

## 2. Mensagem de contexto consumível (1x por evento) + hierarquia

Arquivos-chave:

- apps/api/src/modules/continuation/continuation.service.ts — hierarquia
  atual nas linhas ~107-118 (reclamação<10min → pagou<10min → pedido
  ativo<30min → chamou_garcom<5min → viu_cardapio<10min →
  voltou_sem_acao → first_time) e `clientKindHint`.
- services/ai-service/services/continuation.py — pools de template por
  kind.
- assistente/page.tsx — effect da landing (~linhas 1211-1244) chama
  `POST /:slug/continuation` e já tem precedente de hint consumível
  (`clearDeliveredContinuationHint(res.kind)`).

Problema relatado (Caleb, com vídeo): com pedido ativo, ir ao cardápio e
voltar mostrava SEMPRE o contexto de cardápio — nunca o do pedido (e
vice-versa em outras combinações). A mensagem única vivia disputada.

Comportamento novo:

- Kinds de EVENTO (`abriu_pedido`, `pos_reclamacao`, `pagou`,
  `chamou_garcom`) são CONSUMÍVEIS: aparecem UMA vez na primeira entrada
  no assistente após o evento. Persistir o consumo por
  sessão+evento-específico (ex.: Redis key
  `continuation_shown:<tableSessionId>:<kind>:<eventId>` com TTL da
  sessão, ou registro em `customer_events`). Um NOVO evento do mesmo tipo
  (segundo pedido, segunda reclamação) re-libera a mensagem daquele
  evento.
- Depois de consumida, a derivação PULA esse kind e cai para o próximo da
  hierarquia — tipicamente o contexto de navegação (`viu_cardapio` se
  veio do cardápio, senão `voltou_sem_acao`). É o cenário do Caleb:
  voltou do cardápio com pedido em preparo → mensagem de cardápio
  (o status do pedido já está garantido na eyebrow do item 1).
- A hierarquia continua primeira-que-casa-vence para o que ainda não foi
  consumido. Merge/late-arrival continuam FORA do greeting (chegam como
  cards via WS).
- Conferir a interação com `clientKindHint` (o hint do FE não pode furar
  a regra de consumo nem esconder evento não-consumido).

## 3. Chips de sugestão contextuais (fim dos genéricos)

Problema (screenshot 2026-06-11): chips como "Sobremesa combina?",
"Sugestão leve", "Pratos com camarão" aparecem desconectados da fala da
IA.

- AUDITAR todos os pontos que setam chips: `DEFAULT_SUGGESTIONS` no
  assistente, chips da continuation (`_chips_with_context` em
  continuation.py + pools), chips canônicos das tools (round 4 C-NEW-3 —
  manter o teste `test_chips_coverage_at_least_9_of_10_mutations`
  passando), e quaisquer `setSuggestions(...)` na page.
- Regra: chips devem ser COERENTES com a última mensagem/estado. Ex.:
  greeting de pedido em preparo → chips "Acompanhar pedido", "Adicionar
  bebida", "Chamar garçom"; greeting de cardápio → chips de cardápio;
  pós-reclamação → "Falar com gerente", "Ver minhas reclamações". Definir
  o mapa kind→chips no backend (continuation/tools), não hardcode no FE.
- Os chips existentes que façam sentido continuam; o objetivo é eliminar
  os que não conversam com o contexto.

## 4. Regex/rule-layer sem LLM (economia de tokens) — com cara de IA

Decisão Caleb 2026-06-11: cliques em chips e frases DIRETAS não gastam
LLM; o backend resolve por regex/rule-layer e o FRONT CONTINUA IGUAL
(indicador de tool, typewriter, layer transparente pro usuário).

- Já existe a infra em services/ai-service/main.py: ack-layer,
  `_ORDER_STATUS_RE`/`_VIEW_ORDER_RE`, `_PAYMENT_RE`,
  `_TABLE_MERGE_STATUS_RE` + `_TABLE_MERGE_REQUEST_INTENT_RE` (este
  último adicionado em 2026-06-10 — intenção de juntar vai pra tool, e
  cooldown ativo mantém o bloqueio). `ChatResponse.layer` identifica a
  camada; o FE já renderiza tool indicators por `tool_calls`.
- EXPANDIR o rule-layer para cobrir, no mínimo: ver cardápio / me indica
  (sugestão) / ver meu pedido (já existe) / chamar garçom / pedir a conta
  / pagar / cortesias / juntar mesas (já existe) / falar com gerente.
  Cada regra responde com a MESMA UX de uma resposta de IA (texto curto
  do pool + tool_calls correspondentes + chips coerentes do item 3).
- `mode=expand` (decisão Q2): chips expand continuam SÓ preenchendo o
  input (nunca autoenviar); ao enviar, se a frase cair no regex → sem
  LLM.
- TESTES PESADOS (exigência explícita do Caleb): bateria pytest em
  services/ai-service/tests com tabela de frases de CONVERSAS REAIS:
  - positivas (devem cair no rule-layer): "quero ver o cardápio",
    "me indica algo", "ver meu pedido", "traz a conta", chips canônicos…
  - negativas (DEVEM ir pro LLM): "qual prato combina com vinho tinto?",
    "tem algo sem glúten que chegue rápido?", "meu pedido veio errado, o
    que você sugere?", frases longas/ambíguas com as palavras-gatilho no
    meio ("não quero ver o cardápio agora, me fala de você") etc.
    Asserts: `layer` correto + `provider.chat.await_count` (0 nas
    positivas, >0 nas negativas). Validar também manualmente com algumas
    conversas reais no stack (LLM local) e relatar.

## 5. Decisões 2026-06-11 a executar (perguntas 1/2/3/7 + pendência)

1. CallWaiterSheet 22/600: ACEITA — nada a fazer além de registrar (já
   está no MEMORY.md).
2. (coberta no item 4.)
3. PRIVACIDADE da resposta do gerente: `assistant.staff_message_received`
   deve ir para o room `customer:<customerId>` (só o destinatário), NÃO
   mais `session:<id>`. Emit em
   apps/api/src/modules/assistant/assistant.service.ts
   (`sendStaffToCustomer`, ~linha 1496: `emitToSession`) — o gateway tem
   room de customer; o FE escuta hoje via `useTableSocket` (session room)
   → mover a escuta pro canal do customer (há `useCustomerHostEvents`
   como precedente de room customer). Garantir que reload/histórico
   (inline history só-staff no assistente) continue mostrando a mensagem
   pro destinatário e NUNCA pros demais da mesa — incluir filtro por
   customer no `GET /:slug/assistant/history` se necessário.
4. Jest/Supertest em apps/api: configurar (jest + ts-jest/swc +
   supertest), `npm test` no workspace rodando em CI-style local; migrar
   pelo menos 2-3 specs ts-node existentes como prova (ex.:
   round17-contract.spec.ts) e deixar o padrão documentado pra migração
   gradual.
5. Host UI em tempo real ("pediu a recepção"): superfície do host
   (apps/web-staff /host/notifications ou inbox) listando alerts
   `host_assist_table` (GET /:slug/alerts já filtra por papel) e
   atualizando ao vivo via WS `host.assist_requested` (room
   tenant:slug:host) com som/destaque. Backend já pronto
   (host-assist.controller.ts + emitHostAssistRequested).

## 6. Bug observado a investigar

Toast vermelho "1 error" aparecendo na landing do assistente no iOS
(screenshot 2026-06-11, sim iPhone 16, landing com greeting "Olá, Ana!").
Achar a origem (provável fetch silencioso falhando na landing — listar
candidatos: continuation, courtesies, participants, history, zone-pause)
e corrigir: erro real tratado, sem toast órfão.

## 7. Testes obrigatórios da matriz de contexto (item 1+2)

Cobrir com testes (continuation: unit/integration; fluxo: Playwright —
specs rodam SERIALMENTE, ver MEMORY):

| Ação                                             | Esperado no assistente                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Fez pedido → 1ª entrada                          | mensagem de contexto do pedido (1x) + eyebrow `● RECEBIDO/EM PREPARO · ETA` |
| Mesmo pedido → 2ª entrada (veio do cardápio)     | mensagem de CARDÁPIO + eyebrow de status persiste                           |
| Mesmo pedido → 2ª entrada (não veio do cardápio) | `voltou_sem_acao` + eyebrow persiste                                        |
| Pedido avança (WS) com assistente aberto         | eyebrow muda de estado/ETA ao vivo                                          |
| Pedido entregue                                  | eyebrow volta ao normal; greeting padrão                                    |
| Novo pedido (2º)                                 | mensagem de pedido aparece de novo (1x, evento novo)                        |
| Abriu reclamação → 1ª entrada                    | pós-reclamação (1x); depois libera navegação                                |
| Pagou → 1ª entrada                               | pós-pagamento (1x)                                                          |
| Chamou garçom → 1ª entrada ≤5min                 | chamou_garcom (1x)                                                          |
| Chip/frase direta                                | resposta rule-layer sem LLM, UX idêntica, chips coerentes                   |
| Frase ambígua/raciocínio                         | vai pro LLM                                                                 |
| Resposta do gerente                              | só o cliente destinatário vê (outro participante da mesa não recebe)        |

## Validações mínimas

```bash
npm run build
npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-customer -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json
python3 -m pytest services/ai-service/tests -q
npm test --workspace @restaurant/api        # novo (item 5.4)
npx playwright test <specs novos + tv-delivery-flow tv-kds tv-coverage>  # serial
git diff --check
```

Stack/ambiente: containers montam o REPO BASE com hot-reload; para E2E da
sua branch use `git -C <repo base> switch --detach <branch>`; psql só via
`docker exec restaurant-postgres psql -U postgres -p 5434 -d
restaurant_saas`; o watch do Nest pode travar pós-switch
(`docker restart restaurant-api` resolve); migrations são FATAIS no boot
— migration nova segue o padrão idempotente (037/056). Detalhes nas
memórias do projeto.

## Entrega esperada

- Branch + commit hash (push na branch; sem merge na main).
- O que foi implementado por bloco (1-7) e o que ficou pendente com
  motivo.
- Evidências PEQUENAS (prints reduzidos/log de specs em
  qa-reports/<pasta-nova>/ — nada de trace/vídeo no Git).
- Resultado da validação manual do regex com conversas reais (lista de
  frases testadas e pra onde foram roteadas).
- MEMORY.md atualizado com qualquer regra nova que surgir e as perguntas
  que ficarem abertas pro Caleb.
