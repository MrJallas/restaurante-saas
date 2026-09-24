# Plano de Reestruturação de Framework + Bugfixes + Design de Código — restauranteSaaS

> **Handoff para uma nova sessão.** Este documento é autocontido: contém tudo o que uma auditoria
> multiagente + um scan de botões mortos já descobriram, mais o plano de execução em fatias e os
> guardrails. O agente que receber isto **não precisa re-auditar do zero** — o material de trabalho
> está aqui. Leia por inteiro antes de tocar em código.

---

## 0. Como usar este documento

1. **Leia este plano inteiro.** Depois leia `MEMORY.md` (raiz do repo) e os arquivos de memória do
   projeto listados na §8. Eles são a fonte viva de decisões de produto já tomadas.
2. **Opcional — RAG:** o segundo cérebro do dono (vault Obsidian) tem busca semântica local via
   `bash '~/obsidian/memorias de caleb/rag/recall.sh' "<pergunta>"` (roda dentro
   do container `agentic-os-dashboard`; embeddings locais model2vec; **indexa o vault, não o código**).
3. **Trabalhe na worktree** `restauranteSaaS-framework-bugfixes` (branch `fix/framework-bugfixes`,
   criada a partir da `main`). Base repo: `<repo>`.
4. **Siga a ordem das fatias (§5).** Cada fatia tem **gate de aprovação do dono** + validação E2E
   no simulador iOS antes da próxima.
5. **Respeite os guardrails (§7) sem exceção.** Especialmente: TDD, characterization tests antes de
   qualquer decomposição, git limpo sem atribuição de IA, e cuidado com o número de subagentes.

---

## 1. Contexto do produto

Monorepo turbo (Node) + serviço Python:
- `apps/api` — **NestJS**, porta 3001, prefixo `/api`. Coração do sistema.
- `apps/web-customer` — **Next.js**, porta 3003. App do cliente (QR da mesa → cardápio → pedido → conta).
- `apps/web-staff` — **Next.js**, porta 3002. Staff: host/recepção, garçom, gerente, cozinha, TV KDS.
- `services/ai-service` — **FastAPI**, porta 8000. LLM local (LM Studio) + **rule-layer** (regex que
  resolve frases diretas sem gastar LLM).
- `packages/database` — migrations SQL multi-tenant (`public` + `tenant-template`) + runner
  `migrate-tenants.ts`. `packages/shared-types` — tipos/enums compartilhados.

**Multi-tenancy por schema Postgres:** `:slug` na URL resolve `public.restaurants.schema_name`; o
backend aplica `SET search_path` por request (`modules/tenant/tenant-connection.provider.ts`).

**Três stores:**
- **Postgres** — todo o transacional (orders, payments, table_sessions, waiter_calls, menu, staff…).
- **Redis** — sessões do cliente (`session_token`), rate-limit, locks (SETNX), caches de
  continuation/sugestões (chave com fingerprint sha), cache tenant slug→schema.
- **Mongo** — histórico de chat da IA, inbox staff↔cliente, courtesy history, logs de auditoria,
  prefs/sessões/shift-logs do gerente. Isolamento **por campo** (`tenantId`), não db-per-tenant.

**Doutrina do dono (inquebrável):**
- **Anti-placebo:** todo CTA que parece final pro usuário chama API real com erro visível, OU é stub
  explícito. Proibido `catch { setSuccess() }` silencioso.
- **Prova, não afirma:** evidência (teste verde, screenshot, DB before/after) antes de dizer "pronto".
- **Git limpo SEM atribuição de IA** nos commits.
- **PT-BR** em tudo.
- **V20 Customer UI é LOCKED** (não mexer no visual): `WelcomeModal`, `CpfInput`,
  `ScreenCustomerIdentifyBeforeJoin`, `ScreenCustomerWaitingApproval`, `CallWaiterSheet`, o
  `reclaimBanner` da page da mesa, e a landing do `/assistente`. Bugfix funcional não-visual é OK.

---

## 2. O que já foi feito nesta sessão (para dar noção completa ao próximo agente)

1. **Auditoria multiagente** (15 auditores paralelos: bugs/correção, corridas, performance,
   arquitetura, contratos, NoSQL). Verificação adversarial dos achados. Resultado consolidado nos
   itens da §3.
2. **Scan de botões mortos** (3 agentes: web-customer, web-staff, cross-check de endpoints) —
   35 achados em 3 baldes (§4). JSON bruto: `scratchpad/scan-botoes-mortos.json` (efêmero — se sumir,
   os achados estão reproduzidos na §4).
3. **Git:** o WIP pendente (reforços de `staff-auth`, guards e `payments` — throttle de login/recovery,
   guards de role, bound-check de allocation, + testes) foi commitado (**`a08da76`**); a `main` foi
   fast-forward (favoritos `82bdfbe` + `a08da76`) e **pushed** pra origin. 3 PNGs de QA **não** foram
   commitados (doutrina de não versionar screenshot). Criada a worktree `fix/framework-bugfixes` da main.
4. **Decisões de escopo do dono:** fazer primeiro o "framework que conserta bugs" (Grupo A), depois o
   framework inteiro (B estrutural + C reescrita), **incluindo decomposição de serviços grandes**.
   Cadência: gate de aprovação por fatia + validação iOS. Registrado em memória (§8).
5. **Achado sobre o RAG:** `docs/rag/README.md` descreve um RAG *repo-local* (`.rag/`, `scripts/rag/`)
   que **nunca foi construído**. O RAG real é o do vault e não indexa o código. Indexar o código é uma
   melhoria em aberto (não pedida).
   > **Fechado em 2026-08-31.** O repo-local chegou a existir (índice de 10/jul, 756 arquivos), mas
   > derivou para 55% correto e servia `CLAUDE.md`/`MEMORY.md` desatualizados com aparência de
   > autoridade. Auditado e aposentado: `.rag/`, `scripts/rag/` e `docs/rag/` removidos. Nada se
   > perdeu — todo chunk era cópia derivada de arquivo versionado. Busca hoje: vault para "por quê",
   > Grep/Glob para "onde". Se a busca semântica sobre o repo voltar a ser desejada, o caminho é
   > ingerir os docs no vault, não levantar um segundo índice.

**Estado verde confirmado nesta sessão:** `nest build` OK; `jest` do api **67/67**; `format:check`
verde após `npm run format`.

---

## 3. Bugs confirmados (material de trabalho — com arquivo:linha e fix)

### P0 (corrige primeiro)
| Bug | Arquivo | Fix |
|---|---|---|
| **Rating do cliente descartado.** O `delivered` já cria a row de prompt (rating NULL); a resposta real bate no `UNIQUE(order_id)` → `ON CONFLICT DO NOTHING` → nota+comentário jogados fora; o auto-complaint (nota ≤2) não dispara. No fluxo padrão, nenhuma avaliação persiste. | `apps/api/src/modules/order-ratings/order-ratings.service.ts:27` | `ON CONFLICT (order_id) DO UPDATE SET rating=EXCLUDED.rating, comment=EXCLUDED.comment, submitted_at=now()` **WHERE `submitted_at IS NULL`**; `alreadyRated` só quando `submitted_at` já preenchido. |
| **Barreira de restrição alimentar furada no fallback.** Se `dietary=gluten_free` e nenhum item passa no filtro, cai em `menuItems.slice(0,3)` **sem filtro** sob o texto "opções sem glúten" — recomenda prato com glúten declarado. | `apps/api/src/modules/assistant/assistant.service.ts:896` | Quando `dietary != null` e a lista filtrada vem vazia, responder "não encontrei opções sem X no cardápio" com chips vazios; o fallback de 3 itens só vale com `dietary` null. |

### P1 (bugs reais em fluxo importante)
| Bug | Arquivo | Fix |
|---|---|---|
| **Taxa de serviço 10% só existe no frontend.** A tela soma e mostra o total com taxa, mas o `POST /payments` não envia valor e o backend cobra `SUM(total_cents)` sem taxa. `settings.service_fee_pct` (migration 050) nunca é lido no backend. Cliente vê R$110, paga R$100. | `apps/web-customer/src/app/[slug]/pagamento/page.tsx:130` | Serviço de conta (billing) server-side lê `settings.service_fee_pct`, devolve subtotal/fee/total; o FE só exibe o que o backend calculou. |
| **"Pagar minha parte" sempre falha.** O FE posta `individual` sem `visitId` → backend 400; e o matcher casa allocation por `visitId` quando as allocations são chaveadas por `customerId` → nunca casa. | `apps/api/src/modules/payments/payments.service.ts:50` + `apps/web-customer/src/app/[slug]/pagamento/dividir/page.tsx:128` | Resolver o caller via cookie `recognition_token` (customerId) server-side; casar allocation por customerId; alinhar o FE. |
| **Cliente cancela pedido em qualquer estágio** via `PATCH /:orderId/status`. O `cancelOrder` dedicado bloqueia após `pending_confirmation`, mas o PATCH genérico só valida `newStatus='cancelled'` + ownership; `VALID_TRANSITIONS` permite `cancelled` de `received/in_progress/ready/in_transit`. Burla os 15s. | `apps/api/src/modules/orders/orders.service.ts:2182` | Máquina de estado com transição CAS que valida o status de **origem** permitido pro cancelamento do cliente. |
| **Carrinho com modos mistos vira um order só** com o `billingMode` do primeiro item; o split de pagamento (filtra por `billing_mode`) mis-bucketiza os itens do outro modo. | `apps/web-customer/src/app/[slug]/pedido/revisar/page.tsx:64` | Separar em orders por `billingMode`, ou rejeitar carrinho misto com UX clara. |
| **Rate-limit do handshake WS vira lockout permanente atrás de NAT.** 30/60s por IP conta todos; 30+ devices no Wi-Fi do restaurante reconectando pós-deploy travam todo mundo. `INCR`+`EXPIRE` não-atômico → se o EXPIRE falha, chave sem TTL = bloqueio pra sempre. O helper atômico `incrWithExpiry` já existe e não é usado. | `apps/api/src/modules/websocket/events.gateway.ts:233` | Usar `incrWithExpiry` (Lua atômico); escopar a chave por IP+tenant; não contar handshakes autenticados com sucesso. |
| **`forceMerge` (override do staff) sempre 500** — INSERT em colunas inexistentes de `escalation_chains` (`type/context/current_step/status/resolved_at/resolved_by`). | `apps/api/src/modules/table-merge/table-merge.service.ts:792` | Usar as colunas reais: `kind='table_merge'`, `source_id`, `steps` (jsonb), `completed_at=now()`, `resolution_notes`. Cobrir com teste de integração contra o schema real. |
| **`swap` de mesa (host) sem transação, sem CAS de status, sem rechecar mesa destino livre.** | `apps/api/src/modules/host/host.service.ts:621` | Envolver em transação + CAS + recheck da mesa destino. |
| **Continuation aceita `tableSessionId` arbitrário** → leitura cross-mesa + queima do "1x por evento" de outra mesa. | `apps/api/src/modules/continuation/continuation.controller.ts:69` | Derivar o `tableSessionId` da sessão autenticada, não do body. |
| **`"não"` solto auto-rejeita convite de mesa sem confirmação.** Com pedido de junção/merge pendente, digitar "não sei o que pedir" dispara a rejeição. Falta o guard `_is_direct_phrase`/tamanho que o resto do rule-layer já tem. Gêmeo no backend e no frontend. | `services/ai-service/main.py:709` (`_join_decision_tool`) + `apps/web-customer/src/app/[slug]/assistente/page.tsx:2513` (`tableMergeDecisionFromText`) | Exigir frase direta curta OU confirmação explícita antes de decidir a junção/merge. |
| **`ScreenWaiterCallDetail` é placebo:** valor (R$ 612,40), itens e mesa hardcoded; não faz fetch por `callId`; só o `acknowledgeCall` é real. Garçom pode levar maquininha com valor errado. | `apps/web-staff/src/screens/waiter/ScreenWaiterCallDetail.tsx:30` | Buscar o detalhe real do chamado por `callId`. |
| **Manager approve/reject de late-arrival sempre 401** — a tela chama `api.lateArrival.approve/reject`, mas o controller usa guard de cliente (`SessionGuard`+host check). **E contradiz a doutrina** ("late-arrival não vai pra staff como aprovação ativa, só notificação passiva"). | `apps/api/src/modules/late-arrival/late-arrival.controller.ts:173` + `apps/web-staff/src/screens/manager/ScreenManagerStatDetail.tsx:203` | **Decisão de produto:** remover os botões do manager (staff = passivo). Confirmar com o dono. |
| **Turno overnight fecha a thread do grupo à meia-noite** e recruta o dia errado. Filtro `a.work_date = current_date` não casa assignment de ontem após 00h; `t.work_date < current_date` fecha a thread no meio do turno. | `apps/api/src/modules/staff-messages/staff-messages.service.ts:341` | Lógica de `work_date` ciente de turno overnight (casar assignment de ontem no trecho pós-meia-noite). |

### P2 (secundários)
- **`httpx.Client` + `redis-py` síncronos** chamados via `dispatch_tool` dentro de rotas `async`
  (`main.py:300/967/1153`) sem threadpool → timeout de 10s bloqueia o event loop. Fix: threadpool
  ou client async. `services/ai-service/services/api_client.py:61`.
- **`view_order` sem guard de negação** (o bloco de pagamento tem; o `view_order` na linha 781 não).
  "não quero ver meu pedido" cai no atalho. `services/ai-service/main.py:781`.
- **`useManagerEvents`/`useHostEvents` sem os fixes do `useWaiterEvents`** (socket novo por tela, sem
  retry em 'io server disconnect', staffId só de localStorage). `apps/web-staff/src/hooks/useManagerEvents.ts:132`.
- **`TvKdsBoard.playBeep` vaza AudioContext** (novo por beep, sem `resume()`/`close()`); a TV KDS que
  nunca recarrega fica muda após ~6 beeps (o beep é a notificação do KDS). `apps/web-staff/src/components/tv/TvKdsBoard.tsx:457`.
- **`join:session` (staff) compara `schema_name` do Redis com o slug do handshake** — só funciona
  quando iguais. `apps/api/src/modules/websocket/events.gateway.ts:440`.

### Falso-positivos (NÃO mexer — já verificados como não-bug)
- "short-pay sem bound-check" → o bound-check **existe** (`payments.service.ts:95-101`).
- "splash de 3s dispara durante o prompt de geolocalização" → não há geolocation na splash; o cap é do `/session/init`.
- "`useComplaintEvents` room errado" → o gateway emite dual (`tenant:slug` **e** `customer:id`); chega.
- "sweep de escalation sem CAS/transação" → cenário inalcançável (nenhum código vivo popula `escalation_chain_id`).
- "erasure LGPD deixa dado" → comportamento intencional/documentado (`docs/features/chat-history-lgpd.md`).

---

## 4. Botões mortos / placebo / não-construído (scan — 35 achados, 3 baldes)

### Balde 1 — Wiring quebrado (consertar; é desonestidade de UI)
Padrão `catch { /* ignore */ } + sucesso/navegação local`:
- `/pagamento/feedback` · "Enviar avaliação" — se o POST falha, mostra "Obrigado!" e a avaliação some. `feedback/page.tsx:44`.
- `/pagamento/pix` · "Cancelar" e `/garcom/chamando` · "Cancelar chamado" — falham em silêncio; recurso segue ativo. `pix/page.tsx:126`, `garcom/chamando/page.tsx:74`.
- `/waiter/eu` · "Encerrar turno" — se falha, navega igual ao sucesso; gerente nunca recebe. `waiter/eu/page.tsx:70`.
- `/manager/operacoes` · "Dispensar alerta (X)" — só remove do state local; `api.alerts.dismiss` existe e nunca é chamado. `ScreenManagerOps.tsx:138`.
- `ScreenWaiterCallDetail` (P1 acima).
- `/staff/me` — helper `managerMe` chama rota inexistente (cairia no wildcard `:id` → 500), hoje sem consumidor. `lib/api/manager.ts:300`.

### Balde 2 — Dado fake com backend real disponível (trocar fallback por fetch)
- `/manager/operacoes` (Alertas/Mapa/Funil) — alertas "AO VIVO", 12 mesas e funil (`142 pedidos`,
  `17% acima da meta`) 100% inventados; `/alerts` e `/staff/tables-overview` **existem** e são usados
  em outras telas. `ScreenManagerOps.tsx:41/76/106`.
- `/manager` (Painel home) — mesmos 3 alertas fake. `ScreenManagerHomeA.tsx:156`.

### Balde 3 — Decisão de produto (não é bug; precisa da direção do dono)
- **💳 Pagamento é decorativo.** O QR Pix é um padrão fake (`QRPattern` "QR fake determinístico"),
  não há PSP/webhook no backend, e o **cartão sempre cai numa tela de erro fabricada (E-210)**. O app
  não recebe dinheiro de verdade hoje. → Decidir: assumir demo e tornar a UI honesta (esconder cartão,
  marcar Pix como simulado) vs integrar PSP/Pix real. `pagamento/pix/page.tsx:162`, `pagamento/page.tsx:137`, `pagamento/erro/page.tsx:70` (cartão sem handler), `pagamento/dividir/page.tsx:191` (tab "Customizado" não faz nada), `payments.service.ts:543` ("Enviar resumo" no-op documentado).
- **📊 Telas de leitura do manager fabricadas.** Funil, drill-downs (`em-alerta`, `mesas-ativas`,
  `atencao`, `carga-media`) e **KPIs por funcionário** (rating/mesas/vendas/turno) sintéticos sobre
  nomes reais do roster — o gerente pode avaliar/cobrar um funcionário com número inventado. Backend
  marcado "round19", não construído. `ScreenManagerStaff.tsx:137`, `ScreenManagerStaffSobrecarga.tsx:65`, `ScreenManagerOpsEmAlerta/MesasAtivas/Atencao/CargaMedia`.
- **🔐 Conta do host** (2FA, trocar senha, sessões ativas, prefs de notificação) — stubs atrás da flag
  `NEXT_PUBLIC_SHOW_WIP_FEATURES`; nada chega ao backend. Arquivos em `apps/web-staff/src/screens/host/` (a tela de conta com 2FA/senha/sessões — grep por `2FA`/`change-pin` no diretório; `ScreenHostNotificationPrefs.tsx:125`; `ScreenHostTurnosHistorico.tsx:31`).
- **Waiter profile** — "Editar PIN" sem handler, 5 rows de preferências fake, footer "Trattoria Luna"
  hardcoded. `ScreenWaiterProfile.tsx:187/223`.
- **Features decididas não construídas:** timeline da sessão/mesa no Mongo; foto na reclamação
  (`attachedImageUrl` aceito no BE, sem upload); foto no QR-issue que abre um `window.prompt` pedindo
  URL. `ScreenManagerTableMenu.tsx:147/436`, `ScreenCustomerComplaintCompose.tsx:161`, `ScreenWaiterReportQrIssue.tsx:345`.
- **Personas de demo vazando:** "Renata Albuquerque" hardcoded no Financeiro; "Chamar Henrique" nos alertas.

**Dead code detectado:** `screens/customer-host-flows/OverlaySalonMap.tsx` (placeholder não usado),
`apps/web-staff/src/components/push/*` (não importado por nenhuma rota). Comentários stale em
`ScreenManagerShiftEditor.tsx:25-28` (diz que endpoints de shift não existem, mas a tela já usa `/shifts`).

---

## 5. Plano de execução (fatias com gate de aprovação)

### FASE 1 — Bugs (framework que conserta)
- **Fatia 1B · 2 P0** — rating descartado + barreira de restrição alimentar. *Menor, mais grave,
  prova o loop.* Testes primeiro.
- **Fatia 1A · Integridade de conta** — taxa server-side (serviço de conta/billing), split "pagar
  minha parte" (visitId/customerId), carrinho misto, cancelar em qualquer estágio (máquina de estado
  CAS). *Cluster de dinheiro; alto valor.*
- **Fatia 1C · Realtime + rule-layer** — lockout do handshake WS (`incrWithExpiry`), "não"
  auto-rejeita join/merge (guard), leak de AudioContext na TV, sockets do staff (`realtime-client`
  compartilhado), `view_order` sem guard, `httpx` síncrono.
- **Fatia 1D · Staff ops + botões mortos** — `forceMerge` (colunas), overnight staff-messages,
  `ScreenWaiterCallDetail` (fetch real), Balde 1 (catch silenciosos, dispensar alerta, `/staff/me`),
  Balde 2 (ligar Ops no `/alerts` + `/staff/tables-overview` reais). **Balde 3 = trazer as decisões
  de produto ao dono aqui.**

### FASE 2 — Decomposição de serviços grandes (design de código)
**Só depois dos bugs verdes e validados.** Método obrigatório: **characterization test antes de
mover** (fixar o comportamento atual, inclusive os "feios") → extrair preservando comportamento →
provar os mesmos testes verdes depois. Bug-fix e refactor em **fatias separadas**.

Monstros medidos (>1000 linhas; priorizar por: fonte de bug > acoplamento > tamanho):
1. `apps/web-customer/src/app/[slug]/assistente/page.tsx` — **3265**
2. `apps/api/src/modules/orders/orders.service.ts` — **2363** → `OrdersService` (orquestra) +
   `OrderStateMachine` (transições CAS — mata o cancelar-em-qualquer-estágio) + `EtaEngine` +
   `KdsQueryService` + `OrderSweepService` + `ConsumptionSummaryService` (favoritos/last_items).
3. `apps/api/src/modules/assistant/assistant.service.ts` — **1910**
4. `services/ai-service/main.py` — **1401** (extrair o rule-layer num pipeline declarativo)
5. `apps/api/src/modules/websocket/events.gateway.ts` — **1212** (gateway fino + emitters por domínio,
   tipados com `WsEventName` + payload do union)
6. `apps/api/src/modules/host/host.service.ts` — 1122
7. `apps/api/src/modules/table-merge/table-merge.service.ts` — 1024
8. Telas do staff >1000: `ScreenManagerTableMenu` (1264), `ScreenStaffMessages` (1253),
   `ScreenManagerShiftEditor` (1167), `ScreenManagerStaff` (1069), e `mesa/[tableCode]/page.tsx` (1149).

Distribuição atual: 537 arquivos; 112 >300 linhas; 30 >600; 12 >1000; 2 >2000.

### FASE 3 — Read-models NoSQL (consultas mais rápidas)
Regra: transacional fica no Postgres (fonte da verdade); NoSQL vira read-model/cache invalidado por
**evento WS** (o trilho já existe) + TTL de garantia.

**Redis (cache de leitura quente):**
| Prioridade | Dado | Query atual | Invalidação |
|---|---|---|---|
| Alta | Cardápio completo (categorias+itens+extras+allergens) | `menu.service.ts:18-54` `json_agg`+`GROUP BY` por request, zero cache | rev-bump `INCR` em mutação + TTL 300s + WS `menu:updated` |
| Alta | Sinais de continuation da home (pagamento 10min, pedido 30min, viu cardápio 10min, waiter_call ativo) | `home.service.ts:412-482` multi-CTE a cada `GET /home` | write-through no evento; TTL = a janela; DEL no resolve do call |
| Alta | Feed KDS/TV por estação | `orders.service.ts:1271` 8 joins+LATERAL; TVs pollam 5s | DEL por evento + TTL 10s |
| Média | Dashboard do manager (KPIs dia + chart 7d) | `dashboard.service.ts:8-58` 4 scans/request | TTL 30s |
| Média | Mapa de mesas (host/manager + salão) | `host.service.ts:157-205` / `salon.service.ts:40-69` LATERAL/request | evento + TTL 30s + WS `tables:map:updated` |
| Média | Feed do garçom (deliveries pending + waiter calls) | `deliveries.service.ts:91-130` 7 joins; poll 5s/garçom | DEL por evento + TTL 15s |
| Média | Contexto de menu do assistente | `assistant.service.ts:1745-1771` a cada msg de chat | herdada do read-model do cardápio |
| Base | Caches in-process (`Map` estático): home-static, continuation, tenant slug→schema | `home.service.ts:71`, `tenant.middleware.ts:27` | pré-requisito pra rodar com >1 réplica |

**Mongo (histórico append-only):**
- **Timeline da sessão/mesa** (pedidos, chamados, reclamações, cortesias, pagamentos, merge/unmerge) +
  sumário de sessões antigas. **Decisão do dono já registrada, não implementada.** Hoje só há timeline
  por `orderId` (`orders.service.ts:1014-1122`). Append-only; assina eventos WS existentes; mitigar
  dual-write com seq por sessão + job de reconciliação.
- **Perfil de consumo + favoritos incrementais** (`last_items`, `favorite_items`). Hoje
  `computeFavoriteItems` (`orders.service.ts:2330-2348`) re-agrega o histórico **inteiro** do cliente
  a cada pedido entregue — O(histórico), pior no cliente fiel (feature do commit `82bdfbe`). Mover pra
  doc incremental write-through (PG continua fonte + reconciliação batch).

**Consertar no NoSQL atual:** `staff_threads` sem índice `{tenantId, lastMessageAt}` → inbox do staff
faz COLLSCAN cross-tenant (`customer-staff-messages.service.ts:481`); o TTL 30d do chat depende de
script manual first-boot (garantir índice em runtime). **Voltar pro Postgres:** `manager_shift_logs`
(dado financeiro com filtro `$regex`). **Higiene Postgres:** `ai_usage_daily` é tabela morta;
retenção/purge para `alerts`/`customer_events`/`assistant_messages`; `menu_items.total_orders` faz
`UPDATE +1` dentro da tx do pedido (contenção — tirar da tx).

### RE-SCAN → LOOP
Depois de cada bloco validado, rodar o scan de novo **com poucos subagentes**. ⚠️ O scan de auditoria
original disparou 176 agentes e estourou o limite de 5h — o gargalo foi a **verificação adversarial
fan-out** (3 verificadores por achado). Padrão seguro: **~3 auditores** por scan, **verificação
inline** (o próprio agente lê o código dos achados, sem fan-out). Reportar novos achados + novas
melhorias ao dono, perguntar o que for preciso, e repetir.

---

## 6. Sugestões de framework (ranqueadas por esforço)

**Rápidas (S):** I/O bloqueante fora do event loop no ai-service; `RESET`/`SET LOCAL` no `search_path`;
validação de env no boot (zod/joi); política de mock data no web-staff (badge DEMO/empty-state);
proibir `catch {}` que degrada pra empty-state; helper de transição CAS reutilizável; consolidar
helpers duplicados (relativeTime/playBeep/labels); checagem automatizada de drift `shared-types`↔enums SQL.

**Estruturais (M):** contexto de tenant via `AsyncLocalStorage` (nestjs-cls) no lugar do provider
REQUEST-scoped; package `@restaurant/realtime-client` (registry de socket compartilhado, migrar
host/manager/KDS); quebrar o `EventsGateway` (gateway fino + emitters tipados); adotar TanStack
Query/SWR nos dois FEs; serviço de "Conta" único (billing, taxa server-side); runner central de jobs
TTL/sweep (claim via `SKIP LOCKED`); gerar `shared-types` dos enums SQL; `task test` no turbo + CI.

**Grandes (L):** trocar TypeORM por `pg.Pool` direto; quebrar `assistente/page.tsx`; unificar a
identidade/autorização de staff numa sessão server-side (aposenta a chave embarcada no bundle do
web-staff via `NEXT_PUBLIC_*`); registry único de retenção/erasure por store.

---

## 7. Guardrails e protocolo (sem exceção)

- **TDD:** teste que falha primeiro, depois o fix, depois verde.
- **Characterization test antes de QUALQUER decomposição** (§5 Fase 2). O TypeScript prova que
  *compila*, não que *faz a mesma coisa*. O teste é a rede que prova comportamento preservado.
- **Bug-fix e refactor estrutural em fatias/diffs SEPARADOS.** Nunca no mesmo commit.
- **Validação E2E no simulador iOS por fatia** (não só testes unitários). Ver memória de teste iOS.
- **Gate de aprovação do dono por fatia.** Mostrar evidência (jest verde + screenshot/fluxo iOS),
  esperar aprovação, seguir.
- **Git limpo, SEM atribuição de IA nos commits.** Não versionar packs de screenshot/vídeo/trace.
- **Regras de negócio preservadas.** Se um refactor mudaria comportamento, PARE e confirme com o dono.
- **V20 Customer UI é LOCKED** (§1) — não mexer no visual.
- **Cuidado com subagentes** (§5 RE-SCAN): ~3 por scan, verificação inline.
- **MEMORY.md discipline:** ler antes de trabalho não-trivial; atualizar quando mudar comportamento,
  contrato, rota ou decisão.
- **Playwright E2E rodam serialmente** (helpers compartilham fixtures; paralelo vaza rows).
- **E2E no worktree:** os containers montam o **repo base** (detached checkout pra testar o branch);
  `psql` só via `docker exec restaurant-postgres` (porta 5434 não publicada).

---

## 8. Referências (caminhos e comandos)

**Worktree de trabalho:** `~/meus_projetos/restauranteSaaS-framework-bugfixes`
(branch `fix/framework-bugfixes`, base `main`). Base repo:
`<repo>`. Remote: `origin` (GitHub).

**Memória do projeto** (`~/.claude/projects/-Users-calebmedeiros-meus-projetos-restauranteSaaS/memory/`):
`MEMORY.md` (índice), `project_loop_framework_bugfix.md` (escopo/cadência/decomposição),
`project_audit_fable_2026-07-03.md` (achados da auditoria), `project_sim_ios_testing.md` (teste iOS),
`project_e2e_worktree_stack.md` (worktree + docker), `feedback_playwright_serial.md`,
`project_aiservice_worktree_uvicorn_test.md` (testar ai-service isolado).

**Repo:** `MEMORY.md`, `CLAUDE.md` (doutrina + V20 locked), `docs/rag/README.md`,
`apps/api/TESTING.md` (jest/supertest).

**Comandos de validação:**
```bash
npm run build && npm run format:check
npm test --workspace @restaurant/api        # jest
python -m pytest services/ai-service/tests -q
# ai-service isolado (sem docker): uvicorn da worktree, REDIS_URL= (in-mem), port 8099, header X-AI-Service-Key
# health: curl -fsS localhost:3001/api/health
```

**Scan bruto de botões mortos:** `scratchpad/scan-botoes-mortos.json` (efêmero; reproduzido na §4).

---

## 9. Primeiros passos sugeridos para o novo agente

1. Ler este plano + `MEMORY.md` + as memórias da §8.
2. `cd` na worktree `fix/framework-bugfixes`, rodar os comandos de validação (§8) pra confirmar verde.
3. Confirmar com o dono o início pela **Fatia 1B** (2 P0).
4. TDD: escrever os testes que falham (rating persiste + auto-complaint dispara; restrição alimentar
   sem itens não lista prato proibido) → implementar → jest verde → validar o fluxo de rating no iOS →
   evidência → aprovação → seguir pra 1A.
5. Manter o loop: fatia → validar → aprovar → próxima; re-scan enxuto entre fases; perguntar ao dono
   toda decisão de produto (Balde 3) e toda mudança que toque regra de negócio.
