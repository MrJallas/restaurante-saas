# Round 24 — Bugs transversais de API/Backend (`apps/api` + `services/`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O backend principal está em `apps/api`. Existem services auxiliares (provavelmente em `services/`) — destaco o `services/ai-service` com `continuation.py` que serve greetings dinâmicos pro cliente.

### Diretrizes gerais

1. **Auth `x-staff-id` está quebrado em várias telas do gerente** — bug raiz que precisa resolver primeiro (afeta bugs 12, 20, 34, 43, 44, 46 dos frontends)
2. **Logs e históricos novos → MongoDB**, não Postgres (diretriz do user)
3. **Erros técnicos não devem vazar pra UI** — tratar e retornar mensagem amigável (ou estrutura `{ message_user, error_code }`)
4. **Endpoints com restrição de role**: verificar se a restrição faz sentido (ex.: `manager-only` que deveria ser `manager-or-host` etc.)

### Estrutura conhecida

- `apps/api` — API principal
- `services/ai-service/services/continuation.py` — continuation API com pool de templates por kind (round 4 C-NEW-4)
- `tests/test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations` — coverage enforcement de chips canônicos
- `packages/database/scripts/migrate-tenants.ts` — migration runner com tracking via `__migrations__`. Migration 037 é idempotente (padrão `DO $$ ... IF NOT EXISTS`). Manter esse padrão pra novas migrations.

---

## Bugs (em ordem de prioridade pra destravar frontends)

### 0 (PRIORIDADE MÁXIMA). Auth `x-staff-id` quebrado em rotas do gerente

**Sintomas frontend** (vários):

- `/manager/cortesias` → tela mostra "x-staff-id inválido" em rosa
- `/manager/mesa/{id}` → "host- or manager-only endpoint"
- `/manager/equipe` → botão "Mensagem direta" não funciona, dá erro "xstaff id incorreto"
- `/manager/notifications` → "manager-only endpoint" como badge
- Várias outras telas com falhas silenciosas

**Investigar**:

1. Quem está populando o header `x-staff-id` nas requests do frontend manager?
2. Esse header está consistente entre todas as chamadas (deve ser o `staffId` da session do gerente logado)?
3. O middleware de auth no backend está aceitando o header corretamente?
4. Endpoints marcados como `host-only`/`manager-only`/`manager-or-host`: revisar permissões — alguns talvez devam aceitar `manager` mas o middleware rejeita

**Esperado**:

- Frontend envia `x-staff-id` em **todas** as requests autenticadas (do gerente, host, garçom, cozinha)
- Backend aceita e valida contra a session
- Endpoints de detalhe de mesa (`GET /mesa/{id}`), cortesias, notificações, mensagens entre staff → todos acessíveis pra gerente
- Erros de auth retornam estrutura amigável (não string técnica solta)

**Componente frontend**: ver `05-gerente.md` bugs 34, 43, 44, 46 e `02-recepcionista.md` bug 12.

**Critério de aceitação**:

- [ ] Auditoria das rotas marcadas `host-only` / `manager-only` — documentar quais devem virar `manager-or-host` ou role-agnostic
- [ ] `x-staff-id` sempre presente nas requests autenticadas
- [ ] Erros de auth padronizados como `{ message: "Sessão expirada", code: "AUTH_INVALID" }` (e UI mostra apropriadamente)

---

### 1. Geolocalização — endpoint recebe lat/long do cliente, host vê distância

**Frontend**:

- Cliente envia `{ lat, long }` no scan inicial e/ou no login na mesa → ver `01-cliente.md` bug 1
- Host vê distância do cliente em metros na tela "Verificar QR" → ver `02-recepcionista.md` bug 1

**Backend novo**:

- Endpoint que recebe scan precisa aceitar `{ lat, long, accuracy }` opcional
- Calcular distância entre coords do cliente e centro do raio do restaurante (config do restaurante — adicionar `lat`, `long`, `radius_meters` na tabela `restaurants` ou no settings do tenant)
- Raio inicial pra teste: **3 metros** (config por tenant)
- Endpoint de detalhe do scan (que o host abre): retornar `distance_meters` + `inside_radius: boolean`

**Tabela**:

- Adicionar coluna em `restaurants` (ou tenant settings): `location: { lat, long, radius_meters }`
- Migration nova (idempotente, padrão `DO $$ ... IF NOT EXISTS`)

**Lógica de cálculo**:

- Haversine formula pra distância entre 2 coords
- Threshold: dentro do raio se `distance <= radius_meters`

**Critério de aceitação**:

- [ ] Migration nova adiciona `location` ao restaurante
- [ ] Endpoint de scan aceita coords e calcula distância
- [ ] Endpoint de detalhe de scan retorna `distance_meters` + `inside_radius`
- [ ] Cliente fora do raio recebe erro ao tentar entrar
- [ ] Tests unitários do cálculo de distância (haversine)

---

### 3. "Repetir última visita" — tool/endpoint do LLM pra validar itens antigos vs cardápio atual

**Frontend**: ver `01-cliente.md` bug 3.

**Backend novo**:

- Endpoint: `GET /customers/{id}/last-visit` retorna itens da última visita (com `item_id` + `name_at_time` pra fallback)
- Endpoint: `POST /menu/match-historical` recebe lista de `item_id`s históricos, devolve:
  - `available`: itens que ainda existem no cardápio (com preço atual)
  - `removed`: itens que não existem mais, com **sugestão de substituto** do cardápio atual (mesma categoria/tipo)
- **Tool do LLM**: extender as tools customer-side com `repeat_last_visit_items` que orquestra:
  1. Busca `last-visit` do cliente
  2. Chama `match-historical`
  3. Adiciona itens "available" na comanda
  4. Se houver "removed", avisa o cliente em chat + oferece o substituto
- **Critério de chips**: a tool deve retornar `chips: [...]` (round 4 C-NEW-3 — coverage ≥9/10 mutations enforced em `tests/test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations`)

**Critério de aceitação**:

- [ ] Endpoints novos
- [ ] Tool LLM extendida com chips
- [ ] Match histórico identifica items removidos e sugere substituto da mesma categoria
- [ ] Cobertura de testes mantida

---

### 4. Continuation API — invalidar greeting ao navegar SPA

**Frontend**: ver `01-cliente.md` bug 4.

**Backend** (`services/ai-service/services/continuation.py`):

- O greeting hoje é gerado por kind (round 4 C-NEW-4 — pool de templates, fallback em slots ausentes)
- Frontend está cacheando o greeting e não invalida quando navega entre menus via menu hambúrguer

**Esperado**:

- Continuation API deve retornar um campo `version` ou `updated_at` que reflete o último kind/contexto
- Frontend faz re-fetch quando re-monta a página `/assistente` (e quando o `version` muda)
- Ou usar SSE/WebSocket pra push do greeting atualizado (mais complexo, talvez over-engineering)
- Solução mais simples: cada navegação dentro do app emite um event que invalida cache de greeting do cliente; ao montar `/assistente`, frontend chama continuation API com `last_event` no body

**Critério de aceitação**:

- [ ] Continuation API expõe `version` (ou similar)
- [ ] Cliente sempre vê greeting refletindo última ação (entrou em menu / chamou garçom / etc.)
- [ ] Fallback em slots ausentes mantido (round 4 C-NEW-4)

---

### 5. Lifecycle de thread IA — "Thread não encontrada"

**Frontend**: ver `01-cliente.md` bug 5.

**Investigar**:

- Thread realmente foi apagada do banco? (TTL 30 dias — `docs/design-canvas/docs/features/chat-history-lgpd.md`)
- Ou o endpoint `GET /threads/{id}` está rejeitando por permission/bug?

**Esperado**:

- Endpoint retorna `404 { message_user: "Essa conversa não existe mais", code: "THREAD_NOT_FOUND" }` (não erro técnico solto)
- Frontend trata 404 → mostra empty state amigável
- Cron de cleanup de threads >30 dias documentado (verificar se existe)

**Critério de aceitação**:

- [ ] Endpoint retorna 404 estruturado pra thread inexistente
- [ ] Threads válidas carregam histórico
- [ ] Cron de cleanup documentado/implementado

---

### 14 + 15 + 26. Reclamação manual cliente→gerente + apagar conversas sem IA

**Frontend**: ver `01-cliente.md` bugs 14/15/26.

**Backend**:

**A) Reclamação manual cliente→gerente** (bug 14/26):

- Endpoint: `POST /customers/{id}/complaints` body `{ message, mesa_id }`
- Cria conversa entre cliente e gerente (mesma estrutura de `mensagens com a equipe`)
- Cria notificação pro gerente (push + badge no painel: card "RECLAMAÇÃO · MESA X · ABERTA")
- Pode aproveitar fluxo existente de complaint (`docs/design-canvas/docs/features/complaint-flow-v12.md`)

**B) Apagar conversas direto (sem IA)** (bug 15):

- Endpoint: `DELETE /customers/{id}/conversations` com query param `?scope=team|ai|all`
- Apaga conversas conforme escopo
- Trigger event pra LGPD log

**Critério de aceitação**:

- [ ] Endpoint de reclamação manual cria conversa + notificação
- [ ] Endpoint de delete suporta scope=team/ai/all
- [ ] Notificação pro gerente é entregue via canal apropriado (push + badge UI)

---

### 16. Taxa de serviço 10% — calcular só no fechamento da conta

**Frontend**: ver `01-cliente.md` bug 16.

**Backend**:

- Endpoint que retorna "pedido em revisão" (pré-envio cozinha) **não deve incluir taxa**
- Endpoint que retorna "conta da mesa" (no fechamento) inclui taxa de serviço (10% do consumo total da mesa)
- Coluna `service_fee_pct` no tenant/restaurante (default 10%, configurável)

**Critério de aceitação**:

- [ ] Endpoint de revisão de pedido retorna `subtotal` + `items`, sem taxa
- [ ] Endpoint de fechamento de conta retorna `subtotal` + `service_fee` + `total`
- [ ] `service_fee_pct` configurável por tenant

---

### 17. Preferência "minha comanda / comanda da mesa" — persistir por session

**Frontend**: ver `01-cliente.md` bug 17.

**Backend**:

- Endpoint: `PATCH /customers/{id}/order-preference` `{ preference: "own_check" | "table_check" }`
- Session do cliente (cookie ou JWT) carrega a preferência
- Endpoint de adicionar item lê a preferência se não vier no body

**Critério de aceitação**:

- [ ] Preferência persiste durante session do cliente
- [ ] Endpoint de adicionar item respeita preferência salva
- [ ] Cliente pode trocar via PATCH a qualquer momento

---

### 20. Sino → notificações por role (host, garçom, gerente)

**Frontend**: ver `02-recepcionista.md` bug 12 + `03-garcom.md` bug 20.

**Backend**:

- Endpoint `GET /notifications` deve ser role-aware:
  - Host: notificações relevantes ao host (chegadas, lista de espera, etc.)
  - Garçom: chamados de mesa, pedidos prontos, mensagens
  - Gerente: alertas críticos, reclamações, sobrecarga, etc.
  - Cozinheiro: pedidos novos, prioridade gerência, mensagens
- Atualmente o frontend está chamando o endpoint do gerente (manager-only) — corrigir frontend pra chamar variante apropriada OU fazer endpoint único que retorna baseado no role do `x-staff-id`

**Critério de aceitação**:

- [ ] Cada role tem endpoint funcional de notificações
- [ ] Nenhuma UI mostra `manager-only endpoint`

---

### 23. Garçom encerrar turno — fluxo de aprovação do gerente

**Frontend**: ver `03-garcom.md` bug 23.

**Backend**:

- Endpoint: `POST /waiter/{id}/request-shift-end` body `{ reason? }`
- Cria request com status `pending`
- Cria conversa garçom↔gerente automaticamente (se não existir)
- Insere uma `system_message` na conversa com botões `Aceitar` / `Recusar` (estrutura especial — apenas o gerente pode interagir; garçom só vê)
- Gerente clica:
  - `Aceitar` → atualiza request status `approved`, garçom é deslogado na próxima poll/push, gera resumo do turno
  - `Recusar` → request status `rejected`, garçom continua no turno, mensagem opcional do gerente vai pra conversa
- Push pro garçom quando o gerente responder

**Critério de aceitação**:

- [ ] Endpoint cria request + conversa + system message
- [ ] Gerente pode aceitar/recusar via interação com a system message
- [ ] Push pro garçom funciona

---

### 24. Cozinha "Chamar garçom" — novo fluxo de entrega

**Frontend**: ver `04-cozinha.md` bug 24 (cozinha) + `03-garcom.md` (garçom recebe e marca entregue).

**Backend**:

- Novo endpoint: `POST /orders/{id}/call-waiter` (chamado pela cozinha)
  - Encontra garçom que atende essa mesa
  - Cria chamado/notificação pra esse garçom
  - Atualiza status do pedido pra `waiting_waiter`
- `POST /orders/{id}/in-transit` (chamado pelo garçom quando aperta "Estou levando")
  - Status: `in_transit`
- `POST /orders/{id}/delivered` (chamado pelo garçom na mesa)
  - Status: `delivered`
- Atualizar enum de status: adicionar `waiting_waiter`, `in_transit`

**Critério de aceitação**:

- [ ] 3 endpoints novos
- [ ] Enum de status do pedido extendido
- [ ] Notif push pro garçom específico (não broadcast)
- [ ] Migration idempotente pro enum

---

### 30. Auto-expiração de solicitações de junção de mesas

**Frontend**: ver `05-gerente.md` bug 30.

**Backend**:

- Cron/scheduled task que roda a cada 5min (ou hora)
- Marca solicitações com `expires_at < NOW()` como `expired`
- Solicitações expiradas saem do listing de "pendentes"
- Mantêm em histórico (opcional)

**Critério de aceitação**:

- [ ] Cron implementado
- [ ] Solicitações expiradas não aparecem no painel
- [ ] Tests do cron

---

### 32. "Puxar pra frente" — fluxo de aceitação da cozinha

**Frontend**: ver `04-cozinha.md` bug 32 (cozinha) + `05-gerente.md` (gerente espera resposta real).

**Backend**:

- Endpoint atual de "puxar pra frente" (verificar nome): atualizar pra criar request `pending` pra cozinha
- Endpoint novo: `POST /kitchen-priority-requests/{id}/accept` (cozinha aceita)
- Endpoint novo: `POST /kitchen-priority-requests/{id}/queue-after` body `{ after_order_ids: [...] }` (cozinha diz "será depois dos pedidos X, Y, Z")
- Gerente só vê confirmação real depois da resposta da cozinha
- Push + som na cozinha quando chegar request
- WebSocket/SSE pro gerente receber o status quando cozinha responder

**Critério de aceitação**:

- [ ] Request fica `pending` até cozinha responder
- [ ] Cozinha tem opções `accept` e `queue-after`
- [ ] Status real propagado pro gerente em tempo real
- [ ] Som disparado na cozinha (via WebSocket/SSE)

---

### 34, 43, 44, 46. (cobertos pelo bug 0 acima — `x-staff-id` raiz)

---

### 40. Encerrar turno do gerente — implementar

**Frontend**: ver `05-gerente.md` bug 40.

**Backend**:

- Endpoint: `POST /manager/{id}/end-shift`
- Gera resumo do turno (vendas, mesas atendidas, alertas críticos, etc.)
- Salva resumo no MongoDB (collection `shift_logs` — ver bug 42)
- Invalida session do gerente
- Retorna o resumo no response pra UI mostrar antes de deslogar

**Critério de aceitação**:

- [ ] Endpoint implementado
- [ ] Resumo gerado a partir de queries reais (não mock)
- [ ] Salva no Mongo
- [ ] Deslogga

---

### 42. Histórico de turnos — MongoDB

**Frontend**: ver `05-gerente.md` bug 42.

**Backend**:

- Collection MongoDB: `shift_logs`
- Schema: `{ shift_id, tenant_id, role, start_time, end_time, staff_in_shift: [...], sales_total, orders_count, ticket_avg, mesas_atendidas, critical_alerts: [...], notes }`
- Endpoint: `GET /manager/shift-logs` com filtros (date_range, staff_id, role)
- Endpoint: `GET /manager/shift-logs/{id}` detalhe

**Diretriz**: logs e históricos novos sempre no Mongo, não Postgres. Ver `07-infra-auditoria.md`.

**Critério de aceitação**:

- [ ] Collection criada com índices apropriados (tenant_id + start_time)
- [ ] Endpoint de listing com filtros
- [ ] Endpoint de detalhe
- [ ] Geração de shift_log no encerramento de turno (bug 40)

---

### 47. Endpoint de detalhe de mesa pro gerente (table menu)

**Frontend**: ver `05-gerente.md` bug 47.

**Backend**:

- Endpoint: `GET /mesa/{id}/detail` (ou `GET /tables/{id}/detail`) — acessível pra `host` e `manager`
- Retorna: clientes na mesa, comanda completa (itens + valores), tempo de mesa aberta, status, garçom responsável, etc.
- Endpoint `POST /tables/{id}/add-guest` body `{ name, cpf? }`
- Endpoint `PATCH /tables/{id}` body `{ capacity?, name?, notes? }`
- Endpoint `POST /tables/{id}/close` (fechar conta + liberar)

**Componente de auth**: ver bug 0 — esse endpoint precisa aceitar tanto host quanto manager (corrigir `host-only` se for o caso).

**Critério de aceitação**:

- [ ] 4 endpoints implementados
- [ ] Permissão `host` e `manager` (não só host)
- [ ] Migration se necessário

---

## Validação automatizada obrigatória

- Rodar testes unitários/integração dos módulos alterados, builds relevantes e `git diff --check`.
- Para cada contrato API novo ou corrigido, validar pelo menos um consumidor real:
  - cliente via simulador iOS/idb quando o endpoint for customer-side;
  - staff/manager/host/cozinha via MCP Playwright/browser quando o endpoint for staff-side.
- Em bug 0, além dos testes de guard, mapear e exercitar rotas `manager-only`, `host-only`, `host-or-manager` e chamadas com `x-staff-id` real.
- Para endpoints usados por LLM/tools, testar com LLM local ligado quando disponível e conferir `assistant_messages.tool_calls` + efeito real no backend.
- Salvar relatório curto com matrix endpoint -> consumidor -> evidência em `qa-reports/api-transversais/`.

## Checklist final do chat

- **Prioridade #1**: resolver bug 0 (`x-staff-id` / auditoria de permissions) — destrava metade dos bugs do gerente
- Implementar bugs nesta ordem: 0, 1, 5, 16, 20, 23, 24, 30, 32, 40, 42, 47, depois 3/4/14/15/17/26
- Para cada endpoint novo: testes unitários + integração
- Migrations: padrão `DO $$ ... IF NOT EXISTS` idempotente
- Logs/históricos novos: MongoDB
- Errors estruturados: `{ message_user, code, ... }` não strings técnicas
