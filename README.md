# Plano de Implementação — Restaurant SaaS Platform

## Instrução inicial

Este projeto usa agentes especializados em `.claude/agents/`. Antes de implementar qualquer tarefa, leia o agente correspondente pra garantir que está seguindo os padrões definidos:

- `architect.md` — decisões de arquitetura e consistência
- `backend.md` — NestJS: módulos, guards, WebSocket
- `frontend-customer.md` — app do cliente mobile-first
- `frontend-staff.md` — garçom + KDS + dashboard
- `ai-service.md` — FastAPI: classificador + chat + guardrails
- `database.md` — schema, migrations, seeds
- `devops.md` — Docker, deploy, integrações

Todos os arquivos de referência do projeto (schema SQL, entities, DTOs, estrutura de pastas) estão documentados nos agentes. Siga-os rigorosamente.

## Infra de auditoria

- IDB iOS: setup e script em `docs/dev/idb-setup.md` e `scripts/audit-ui.sh`.
- MongoDB para logs novos: política, collections e índices em `docs/dev/mongodb-logs.md`.
- Geolocalização cross-app: raio inicial e configuração futura em `docs/features/geolocation.md`.

---

## Sprint 0 — Setup do Monorepo + Infra Base

**Agentes:** `architect.md`, `devops.md`, `database.md`

### Tarefas em ordem:

1. Inicializar Turborepo no root com workspaces:
   - `apps/api` (NestJS)
   - `apps/web-customer` (Next.js)
   - `apps/web-staff` (Next.js)
   - `services/ai-service` (FastAPI Python)
   - `packages/shared-types` (tipos TS compartilhados)
   - `packages/database` (migrations + seeds)

2. Configurar ESLint, Prettier, TSConfig base compartilhados no root.

3. Setup `apps/api`:
   - NestJS com TypeScript strict
   - `main.ts`, `app.module.ts`, `config/` (app, database, redis, ai configs)
   - Instalar dependências: @nestjs/typeorm, typeorm, pg, @nestjs/platform-socket.io, class-validator, class-transformer, ioredis, uuid

4. Setup `apps/web-customer`:
   - Next.js App Router + TypeScript
   - Tailwind CSS configurado
   - Layout root com ThemeProvider placeholder
   - `globals.css` com CSS variables placeholder

5. Setup `apps/web-staff`:
   - Next.js App Router + TypeScript
   - Tailwind CSS configurado
   - Layout root

6. Setup `services/ai-service`:
   - FastAPI + Uvicorn
   - `main.py` com CORS
   - `config.py` lendo env vars (LLM_PROVIDER, LLM_API_KEY, LLM_MODEL_MAIN, LLM_MODEL_CLASSIFIER)
   - `GET /health` endpoint

7. Criar `docker-compose.yml`:
   - postgres:16 na porta 5432 com volume persistente
   - redis:7 na porta 6379
   - Criar `.env.example` com todas as variáveis definidas em `devops.md`

8. Criar `packages/database/migrations/public/`:
   - `001_create_plans.sql`
   - `002_create_restaurants.sql`
   - `003_create_admin_users.sql`
   - `004_create_ai_usage_daily.sql`
   Seguir exatamente o schema SQL do projeto (UUIDs, TIMESTAMPTZ, snake_case).

9. Criar `packages/database/migrations/tenant-template/`:
   - `001_create_settings.sql`
   - `002_create_tables.sql`
   - `003_create_table_sessions.sql`
   - `004_create_customers.sql` (CPF como VARCHAR(11), sem hash)
   - `005_create_visits.sql`
   - `006_create_menu.sql` (menu_categories + menu_items + menu_item_extras)
   - `007_create_orders.sql` (orders + order_items + order_item_extras + order_status_history)
   - `008_create_staff.sql`
   - `009_create_deliveries.sql` (order_deliveries)
   - `010_create_waiter_calls.sql`
   - `011_create_assistant_messages.sql`
   - `012_create_payments.sql`
   - `013_create_feedbacks.sql`
   - `014_create_promotions.sql`
   - `015_create_consumption_summary.sql`

10. Criar `packages/database/scripts/create-tenant.ts`:
    - Recebe nome do tenant como argumento
    - CREATE SCHEMA {name}
    - Roda todas as migrations de tenant-template/ em ordem substituindo {schema}
    - Roda seeds default

11. Criar `packages/database/seeds/tenant-template/`:
    - `default_settings.sql` — config inicial com cores padrão, fontes, timezone
    - `default_categories.sql` — categorias padrão: Entradas, Pratos Principais, Bebidas, Sobremesas

12. Rodar docker-compose up, executar migrations do public, criar tenant `restaurant_dev` com o script.

13. Verificar que todos os serviços sobem: api (3001), web-customer (3000), web-staff (3002), ai-service (8000).

### Critério de conclusão:
Monorepo funcional com hot reload, banco com schema public + restaurant_dev populados, todos os serviços rodando e conectados.

---

## Sprint 1 — Sessão por Mesa + Popup Inicial + Reconhecimento

**Agentes:** `backend.md`, `frontend-customer.md`, `database.md`

### Backend (apps/api):

1. Criar módulo `tenant`:
   - `tenant.middleware.ts` — extrai slug da URL, busca restaurant no schema public, resolve schema_name, injeta no request
   - `tenant-connection.provider.ts` — executa `SET search_path = '{schema}'` na connection
   - `tenant.decorator.ts` — decorator `@Tenant()` que retorna schema string do request

2. Criar módulo `table-session`:
   - `qr-code.service.ts`:
     - `generateHmac(tableCode, secret, timestamp)` → HMAC-SHA256
     - `validateHmac(tableCode, signature, timestamp, secret)` → boolean + check timestamp freshness
   - `table-session.service.ts`:
     - `initSession(tableCode, hmacSignature, timestamp)`:
       1. Busca mesa pelo code
       2. Valida HMAC com qr_hmac_secret da mesa
       3. Verifica mesa ativa e status != inactive
       4. Cria table_session no banco
       5. Gera session_token (UUID)
       6. Salva no Redis com TTL 4h: `session:{token}` → `{ sessionId, tableId, tableCode, schemaName }`
       7. Gera welcome pool: shuffle [0..29], RPUSH `welcome_pool:{sessionId}`
       8. Retorna SessionResponseDto
   - `table-session.controller.ts`:
     - `POST /api/:slug/session/init` → InitSessionDto → SessionResponseDto

3. Criar `session.guard.ts`:
   - Extrai session_token do cookie
   - Busca no Redis
   - Se não existe ou expirado → 401
   - Injeta session data no request

4. Criar decorator `@Session()` que retorna session data do request.

5. Criar módulo `customers`:
   - `cpf.util.ts` — validação dos 2 dígitos verificadores, rejeita sequências iguais
   - `customers.service.ts`:
     - `welcome(name, cpf, sessionId)`:
       1. Valida CPF server-side
       2. Busca customer pelo CPF
       3. Se existe → atualiza nome se diferente, incrementa total_visits, atualiza last_visit_at
       4. Se não existe → cria customer com recognition_token (UUID)
       5. Cria visit vinculando customer + table_session
       6. Busca customer_consumption_summary se existir
       7. Retorna CustomerWelcomeResponseDto (com isReturning + lastVisitSummary)
     - `recognize(recognitionToken, sessionId)`:
       1. Busca customer pelo recognition_token
       2. Se não encontra → 404
       3. Incrementa total_visits, atualiza last_visit_at
       4. Cria visit
       5. Busca consumption_summary
       6. Retorna mesmo DTO com isReturning=true
   - `customers.controller.ts`:
     - `POST /api/:slug/customer/welcome` → CustomerWelcomeDto → CustomerWelcomeResponseDto
     - `POST /api/:slug/customer/recognize` → CustomerRecognizeDto → CustomerWelcomeResponseDto

6. Criar `infra/redis/redis.module.ts` e `redis.service.ts`:
   - Métodos: set(key, value, ttl), get(key), del(key), lpop(key), rpush(key, ...values)

### Frontend (apps/web-customer):

7. Criar `lib/cpf.ts` — mesma validação do backend (dígitos verificadores + rejeita sequências).

8. Criar `lib/api.ts` — fetch wrapper que:
   - Inclui cookie de sessão automaticamente (credentials: 'include')
   - Base URL configurável
   - Tratamento de erros (401 → redireciona pra QR, 400 → retorna mensagem)

9. Criar `lib/storage.ts`:
   - `setRecognitionToken(token)` — salva em cookie com expiry 1 ano
   - `getRecognitionToken()` — lê cookie
   - `clearRecognitionToken()` — remove cookie

10. Criar `lib/session.ts`:
    - `getSessionToken()` — lê do cookie httpOnly (set pelo backend via Set-Cookie header)

11. Criar `providers/SessionProvider.tsx`:
    - Context com: sessionId, tableCode, tableLabel, isValid, isLoading
    - No mount: verifica se tem session token válido

12. Criar `hooks/useSession.ts` — consome SessionProvider.

13. Criar `hooks/useRecognizedCustomer.ts`:
    - Lê recognition_token do cookie
    - Se existe → chama `POST /customer/recognize`
    - Retorna: { isRecognized, customer, lastVisitSummary, isLoading }

14. Criar rota `[slug]/mesa/[tableCode]/page.tsx`:
    - Splash screen: fundo do restaurante + "Preparando sua experiência..."
    - Ao montar: chama `POST /session/init` com tableCode + HMAC extraídos da URL
    - Se sucesso → salva session → verifica recognition token
    - Se reconhecido → pula popup → vai pra home
    - Se não reconhecido → mostra WelcomeModal

15. Criar `components/welcome/WelcomeModal.tsx`:
    - Modal centralizado com fundo escurecido
    - Título: "Bem-vindo ao {restaurante}"
    - Subtítulo: "Para personalizar sua experiência, informe seu nome e CPF."
    - Campo nome: min 2 chars, trim, capitalize
    - Campo CPF via CpfInput.tsx
    - Botão "Continuar" → valida → chama `/customer/welcome` → fecha modal → abre home
    - Botão "Continuar sem personalização" → cria sessão anônima → abre home
    - Animação de abertura/fechamento suave

16. Criar `components/welcome/CpfInput.tsx`:
    - Máscara automática: 000.000.000-00
    - Validação em tempo real (border verde/vermelha)
    - Mensagem de erro abaixo do campo: "CPF inválido. Verifique os números digitados."

### Testes:
- CPF válido aceito, CPF inválido rejeitado (client + server)
- HMAC válido inicia sessão, HMAC inválido retorna 401
- Sessão expirada retorna 401
- Recognition token válido pula popup
- Recognition token inválido/ausente mostra popup
- Popup fecha e abre home após welcome

---

## Sprint 2 — Home Personalizada + Mensagens Aleatórias

**Agentes:** `backend.md`, `frontend-customer.md`

### Backend:

1. Criar módulo `home`:
   - `welcome-messages.ts`:
     - Array de 30 templates de boas-vindas, cada um com placeholders: {nome}, {restaurante}, {ultimo_prato}, {ultima_bebida}, {ultima_sobremesa}
     - Exemplos variados: saudação formal, descontraída, com referência a horário, com elogio, com curiosidade sobre o cardápio, etc.
     - Função `renderTemplate(templateIndex, variables)` → string final
   - `home.service.ts`:
     - `getHome(sessionId, customerId?)`:
       1. Busca table_session + table
       2. Busca tenant settings (restaurantName, branding)
       3. LPOP de `welcome_pool:{sessionId}` no Redis → índice do template
       4. Se pool vazio → re-shuffle e RPUSH novamente
       5. Se customer existe → busca consumption_summary → preenche variáveis com últimos itens
       6. Se customer não existe (anônimo) → usa variáveis genéricas
       7. Renderiza template com variáveis
       8. Busca highlights: menu_items featured + day_special + ORDER BY total_orders DESC LIMIT 5
       9. Monta QuickActions (fixas)
       10. Retorna HomeResponseDto
   - `home.controller.ts`:
     - `GET /api/:slug/home?sessionId=xxx&customerId=xxx` → HomeResponseDto

### Frontend:

2. Criar `hooks/useTenantTheme.ts`:
   - Busca settings do tenant (GET /api/:slug/settings/public — retorna cores, fontes, logo)
   - Aplica CSS variables no document.documentElement: --color-primary, --color-secondary, --color-accent, --font-hero, --font-body
   - Carrega Google Fonts dinamicamente

3. Criar `providers/ThemeProvider.tsx` — wrapper que chama useTenantTheme.

4. Criar `components/home/TypingText.tsx`:
   - Props: text, speed (default 25ms), onComplete callback
   - Renderiza char por char com requestAnimationFrame
   - Se texto > 150 chars → auto-acelera pra 15ms
   - Botão "Pular" que mostra texto completo imediatamente
   - Cursor piscando no final por 1s

5. Criar `components/home/AiMessageHero.tsx`:
   - Rótulo: "Assistente do restaurante" com ícone sutil
   - Indicador de 3 pontos pulsando antes do texto
   - TypingText com a heroMessage do backend
   - Após terminar → fade in dos botões

6. Criar `components/home/QuickActionButtons.tsx`:
   - 5 botões: Ver cardápio, Sugestão da IA, Chamar garçom, Ver meu pedido, Pagar conta
   - Ícones via lucide-react
   - Estado sutil durante typing → destaque total após typing completo

7. Criar `components/home/HighlightCards.tsx`:
   - Cards horizontais scrolláveis
   - Cada card: imagem + nome + preço + badge (Prato do dia, Mais pedido, etc.)

8. Criar `components/home/LastVisitBanner.tsx`:
   - Só aparece se isReturning
   - "Na sua última visita: Risoto de camarão, Suco de limão"
   - Botão: "Pedir algo parecido"

9. Criar `components/layout/BottomNav.tsx`:
   - Dock fixo inferior: Home, Cardápio, Pedido, Assistente, Conta
   - Ícones via lucide-react
   - Indicador de rota ativa

10. Criar `components/layout/TopBar.tsx`:
    - Logo do restaurante (de settings)
    - "Mesa 12" discreto
    - Ícone de menu/ajuda

11. Criar `components/layout/AppShell.tsx`:
    - Wrapper: TopBar + children + BottomNav
    - Padding bottom pro dock não cobrir conteúdo

12. Montar a home completa em `[slug]/mesa/[tableCode]/page.tsx`:
    - Após sessão válida + welcome/recognize → renderiza AppShell com AiMessageHero + QuickActionButtons + HighlightCards + LastVisitBanner

---

## Sprint 3 — Cardápio + Pedido

**Agentes:** `backend.md`, `frontend-customer.md`, `frontend-staff.md`

### Backend:

1. Módulo `menu`:
   - `GET /api/:slug/menu/categories` — categorias ativas ordenadas por sort_order
   - `GET /api/:slug/menu/items?categoryId=xxx` — itens com extras, filtrados por is_available
   - `GET /api/:slug/menu/items/:id` — detalhe completo (long_description, allergens, ingredients, extras)
   - `GET /api/:slug/menu/search?q=xxx` — busca por name ILIKE + tags @> + ingredients @>
   - `GET /api/:slug/menu/featured` — is_featured OR is_day_special, ORDER BY total_orders DESC

2. Módulo `orders`:
   - `POST /api/:slug/orders` — CreateOrderDto:
     - Valida que todos menuItemIds existem e is_available
     - Calcula unit_price_cents, subtotal_cents, total_cents
     - Grava order + order_items + order_item_extras
     - Cria order_status_history (null → open)
     - Retorna OrderResponseDto
   - `GET /api/:slug/orders/current?sessionId=xxx` — pedido(s) ativo(s) da sessão (status != delivered && != cancelled)
   - `PATCH /api/:slug/orders/:id/status` — UpdateOrderStatusDto:
     - Valida transição de estado (máquina de estados):
       - open → confirmed
       - confirmed → preparing
       - preparing → ready
       - ready → delivered
       - qualquer → cancelled (exceto delivered)
     - Rejeita transições inválidas com 400
     - Grava order_status_history
     - Se status = confirmed → emite WebSocket `order:new` pra KDS
     - Se status = ready → emite WebSocket `order:ready` pra garçons
   - `POST /api/:slug/orders/:id/items` — adiciona itens a pedido existente (só se status = open)

### Frontend (web-customer):

3. Rota `/cardapio/page.tsx`:
   - `MenuCategoryTabs.tsx` — tabs horizontais scrolláveis
   - `MenuSearchBar.tsx` — busca com debounce 300ms
   - `MenuFilterChips.tsx` — "Sem lactose", "Vegano", "Sem glúten" (filtra por tags)
   - `MenuItemCard.tsx` — foto, nome, descrição curta, preço formatado (R$), badges de tags
   - Ao clicar no card → abre detalhe

4. Rota `/cardapio/[itemId]/page.tsx`:
   - `MenuItemDetailModal.tsx` — fullscreen ou bottom sheet:
     - Foto grande, nome, descrição completa
     - Seção de alérgenos com ícones
     - Seção de ingredientes
     - Calorias + tempo de preparo
     - Extras selecionáveis com preço
     - Campo de observação (ex: "SEM CEBOLA")
     - Seletor de quantidade
     - Botão "Adicionar ao pedido" com preço total

5. Rota `/pedido/page.tsx`:
   - `OrderSummary.tsx` — lista de itens do pedido atual
   - `OrderItemRow.tsx` — nome + qty +/- + notes + extras + subtotal
   - `OrderNotesInput.tsx` — observação geral do pedido
   - Total da conta
   - Botão "Enviar pedido" → PATCH status para confirmed → toast "Pedido enviado!"

### Frontend (web-staff — garçom):

6. Rota `/garcom/pedidos/page.tsx`:
   - `OrderLauncher.tsx`:
     - Garçom seleciona mesa (dropdown das mesas ocupadas)
     - Lista de itens do cardápio com busca
     - Adiciona itens com quantity + notes
     - Confirma e envia com createdBy: 'waiter'

---

## Sprint 4 — KDS Cozinha + Entregas + Chamada de Garçom

**Agentes:** `backend.md`, `frontend-staff.md`, `frontend-customer.md`

### Backend:

1. Módulo `websocket`:
   - `events.gateway.ts` — NestJS WebSocket Gateway:
     - Namespace: `/ws`
     - Rooms por tenant+role: `{schema}:kitchen`, `{schema}:waiter`, `{schema}:customer:{sessionId}`
     - Eventos emitidos: `order:new`, `order:status_changed`, `order:ready`, `order:claimed`, `order:delivered`, `waiter:call`, `waiter:acknowledged`
     - Auth: valida token no handshake (staff token ou session token)

2. Módulo `delivery`:
   - `POST /api/:slug/delivery/claim`:
     - Verifica que order.status = ready
     - Verifica que não existe delivery ativo pro mesmo order
     - Cria order_delivery com claimedBy = staffId
     - Emite `order:claimed` pra room `{schema}:waiter` (todos garçons descartam o card)
     - Retorna delivery com dados da mesa + itens
   - `POST /api/:slug/delivery/:id/delivered`:
     - Atualiza delivery.delivered_at + status = delivered
     - Atualiza order.status = delivered + order_status_history
     - Emite `order:delivered`
   - Background job (ou check periódico): se delivery não claimada em 3 min → re-emite `order:ready` com flag `urgent: true`

3. Módulo `waiter-calls`:
   - `POST /api/:slug/waiter-call` — CreateWaiterCallDto:
     - Verifica anti-spam: max 1 chamada pending por sessão
     - Cria waiter_call
     - Emite `waiter:call` pra room `{schema}:waiter`
   - `POST /api/:slug/waiter-call/:id/acknowledge`:
     - Atualiza status acknowledged + acknowledged_by + acknowledged_at
     - Emite `waiter:acknowledged`

### Frontend (web-staff — KDS cozinha):

4. Rota `/cozinha/page.tsx`:
   - Layout fullscreen, sem header/nav, otimizado pra TV
   - `KdsBoard.tsx` — 3 colunas: Novos (amarelo) | Preparando (laranja) | Prontos (verde)
   - `KdsOrderCard.tsx`:
     - Mesa em fonte grande no topo
     - Lista de itens com quantity
     - Observações (notes) em FUNDO VERMELHO, FONTE GRANDE, BOLD, CAIXA ALTA
     - `KdsTimer.tsx` — cronômetro desde created_at do pedido
   - Touch/click no card: avança status (novo → preparando → pronto)
   - Ao marcar pronto → PATCH /orders/:id/status (ready)
   - WebSocket `order:new` → adiciona card na coluna Novos com beep sonoro
   - Auto-reconnect: se WS desconectar, tenta reconectar a cada 3s + fallback GET /orders?status=confirmed,preparing a cada 10s

### Frontend (web-staff — garçom):

5. Rota `/garcom/entregas/page.tsx`:
   - `DeliveryCard.tsx` — "Mesa 12 — Risoto de camarão, Suco" + botão "Eu levo"
   - `DeliveryNotification.tsx` — toast com som ao receber `order:ready`
   - Ao clicar "Eu levo" → POST /delivery/claim → card some
   - Após claim: mostra "Levar para Mesa 12" com lista de itens
   - Botão "Entregue" → POST /delivery/:id/delivered
   - Cards urgentes (>3 min sem claim) com borda vermelha pulsante

6. Rota `/garcom/chamadas/page.tsx`:
   - `WaiterCallAlert.tsx` — "Mesa 7 está chamando" com som + botão "Estou indo"
   - WebSocket `waiter:call` → adiciona alerta

### Frontend (web-customer):

7. Criar `hooks/useOrderStatus.ts`:
   - WebSocket room `{schema}:customer:{sessionId}`
   - Escuta `order:status_changed` → atualiza status no pedido em tempo real
8. Atualizar `/pedido/page.tsx` — badge de status que muda em tempo real (preparando → pronto → entregue)

---

## Sprint 5 — Assistente IA com Guardrails

**Agentes:** `ai-service.md`, `backend.md`, `frontend-customer.md`

### Microsserviço Python (services/ai-service):

1. Criar `services/llm/base.py`:
   - Classe abstrata `LLMProvider` com métodos: classify(), chat(), count_tokens(), estimate_cost_cents()

2. Criar `services/llm/factory.py`:
   - Lê LLM_PROVIDER env var
   - Retorna instância do provider correto
   - Registrar como dependency no FastAPI

3. Criar `services/llm/providers/openai.py`:
   - Implementa LLMProvider usando openai SDK
   - Modelos via LLM_MODEL_MAIN e LLM_MODEL_CLASSIFIER

4. Criar `services/llm/providers/anthropic.py`:
   - Implementa LLMProvider usando anthropic SDK

5. Criar `services/llm/providers/google.py`:
   - Implementa LLMProvider usando google-generativeai SDK

6. Criar `guardrails/blocked_patterns.py`:
   - ~50 regex patterns compilados cobrindo: política, religião, código/programação, matemática, tradução, finanças/investimentos, esportes, fofoca/celebridades, notícias, jogos, receitas externas, ciência, história geral, filosofia, educação, qualquer tema não-restaurante
   - Função `check_blocked(message) → (bool, str?)` — retorna se bloqueado + pattern que deu match

7. Criar `guardrails/allowed_intents.py`:
   - Lista de intenções válidas com keywords associadas: prato, ingrediente, alérgeno, sugestão, harmonização, bebida, sobremesa, pedido, pagamento, conta, funcionamento, horário, atendimento, garçom, promoção, reserva

8. Criar `services/intent_classifier.py`:
   - Camada 1: chama `check_blocked()` — se blocked → retorna `{ allowed: false, reason: 'regex', confidence: 1.0 }`
   - Camada 2: chama `provider.classify()` com prompt: "A mensagem abaixo é sobre um restaurante (cardápio, pratos, ingredientes, pedido, pagamento, atendimento)? Responda APENAS 'sim' ou 'não'."
   - Se 'não' ou confidence < 0.7 → retorna `{ allowed: false, reason: 'classifier' }`
   - Se 'sim' → retorna `{ allowed: true }`

9. Criar `services/prompt_builder.py`:
   - Monta system prompt com:
     - Regras: "Você é o assistente do restaurante {nome}. Responda APENAS sobre pratos, ingredientes, alérgenos, sugestões, harmonizações, pedidos, pagamento e atendimento. Se perguntarem qualquer coisa fora desse escopo, recuse educadamente."
     - Cardápio serializado (nome, descrição, preço, tags, alérgenos por item)
     - Histórico do cliente (últimos itens consumidos)
     - Pedido atual (se houver)
   - Recebe tenant_context e customer_context como parâmetros

10. Criar `services/chat_service.py`:
    - Recebe message + history + contexts
    - Chama prompt_builder pra montar system prompt
    - Chama `provider.chat()`
    - Mede latência, tokens, custo

11. Criar `guardrails/response_validator.py`:
    - Regex check na resposta do LLM
    - Se contém conteúdo fora de escopo → substitui por mensagem padrão

12. Criar `services/cost_tracker.py`:
    - Calcula custo estimado usando `provider.estimate_cost_cents(tokens_in, tokens_out)`

13. Criar routers:
    - `POST /classify` → intent_classifier
    - `POST /chat` → classify primeiro, se allowed → chat_service → response_validator → retorna

### Backend (apps/api):

14. Criar `infra/ai/ai-service.client.ts`:
    - HTTP client que chama ai-service (POST /classify, POST /chat)
    - Base URL via AI_SERVICE_URL env var
    - Timeout 35s

15. Criar módulo `assistant`:
    - `assistant.service.ts`:
      1. Verifica rate limit no Redis: `ai_count:{sessionId}` < maxAiMessagesPerSession (de settings)
      2. Chama ai-service `/classify`
      3. Se blocked → salva em assistant_messages (was_blocked=true, block_reason) → retorna mensagem padrão + suggestion chips
      4. Se allowed → monta contexto (busca cardápio, consumption_summary, pedido atual) → chama ai-service `/chat`
      5. Salva em assistant_messages (tokens, custo, model_used)
      6. Incrementa `ai_count:{sessionId}` no Redis
      7. Atualiza ai_usage_daily no schema public (UPSERT)
      8. Retorna AssistantResponseDto
    - `assistant.controller.ts`:
      - `POST /api/:slug/assistant/message` — protegido por SessionGuard

### Frontend (web-customer):

16. Rota `/assistente/page.tsx`:
    - `AssistantChat.tsx`:
      - Lista de ChatBubbles (user à direita, assistant à esquerda)
      - Auto-scroll ao receber nova mensagem
      - Input com limite de 1000 chars + botão enviar
    - `SuggestionChips.tsx` acima do input:
      - "Quais pratos não têm lactose?"
      - "Quero uma sugestão leve"
      - "Qual sobremesa combina com meu pedido?"
      - "Quais pratos têm camarão?"
      - "Como faço para pagar?"
      - "O que vocês recomendam hoje?"
    - `TypingIndicator.tsx` — 3 pontos pulsando enquanto espera resposta
    - `BlockedMessage.tsx` — quando was_blocked=true:
      - Ícone de info, fundo suave diferenciado
      - "Sou o assistente do restaurante e posso te ajudar com pratos, ingredientes, sugestões, pedidos, pagamento e atendimento. Perguntas fora desse contexto não são permitidas."
      - Re-exibe SuggestionChips abaixo

17. Criar `hooks/useAssistant.ts`:
    - Gerencia histórico de mensagens local (useState)
    - Função sendMessage → POST /assistant/message → adiciona resposta ao histórico
    - Loading state

---

## Sprint 6 — Pagamento Pix + Feedback

**Agentes:** `backend.md`, `frontend-customer.md`

### Backend:

1. Módulo `payments`:
   - `psp-adapter.service.ts`:
     - Interface PspAdapter com métodos: createPixCharge(amountCents, description) → { qrCode, copyPaste, transactionId }
     - Implementação AsaasAdapter e WooviAdapter
     - Factory baseada em settings.psp_provider
     - Descriptografa settings.psp_api_key_encrypted com ENCRYPTION_MASTER_KEY (AES-256-GCM)
   - `payments.service.ts`:
     - `createPayment(sessionId, amountCents)`:
       1. Calcula total baseado nos orders da sessão (ou recebe amountCents)
       2. Chama psp-adapter.createPixCharge()
       3. Cria payment com status pending + pix_qr_code + pix_copy_paste
       4. Retorna PaymentResponseDto
   - `webhook.controller.ts`:
     - `POST /api/webhook/psp/:slug`:
       1. Valida assinatura do webhook (PSP_WEBHOOK_SECRET)
       2. Busca payment pelo psp_transaction_id
       3. Atualiza status → confirmed, paid_at
       4. Fecha table_session (status = closed, closed_by = 'payment')
       5. Emite WebSocket `payment:confirmed` pro customer
   - `payments.controller.ts`:
     - `POST /api/:slug/payments/create` — SessionGuard
     - `GET /api/:slug/payments/:id/status` — polling alternativo

2. Módulo `feedback`:
   - `POST /api/:slug/feedback` — CreateFeedbackDto:
     - Valida que sessão existe e feedback_given = false
     - Cria feedback
     - Atualiza visit.feedback_given = true
     - Retorna 201

### Frontend:

3. Rota `/pagamento/page.tsx`:
   - `PaymentSummary.tsx` — todos os itens do pedido com subtotais + total
   - `PixQrCode.tsx` — renderiza QR Code (via biblioteca como qrcode.react)
   - `PixCopyPaste.tsx` — código com botão "Copiar" + toast "Copiado!"
   - `PaymentStatus.tsx` — "Aguardando pagamento..." com spinner → ao receber WebSocket payment:confirmed → "Pagamento confirmado!" com animação de check

4. Rota `/feedback/page.tsx`:
   - Redireciona automaticamente após pagamento confirmado
   - `StarRating.tsx` — 1-5 estrelas tocáveis (obrigatório)
   - `CategoryRatings.tsx` — comida, serviço, ambiente (opcionais)
   - `FeedbackForm.tsx` — campo de comentário livre
   - Botão "Enviar avaliação"
   - Tela de agradecimento: "Obrigado, {nome}! Sua opinião é muito importante."

---

## Sprint 7 — Dashboard do Dono + Configurações

**Agentes:** `backend.md`, `frontend-staff.md`

### Backend:

1. Módulo `staff`:
   - CRUD: create, list, update, deactivate
   - Login por PIN: `POST /api/:slug/staff/login` → valida pin_hash → retorna JWT com { staffId, role, schemaName }
   - `staff-auth.guard.ts` — valida JWT, verifica role

2. Módulo `settings`:
   - `GET /api/:slug/settings` — retorna config completa (AdminAuthGuard)
   - `GET /api/:slug/settings/public` — retorna só branding (sem auth, pra ThemeProvider)
   - `PATCH /api/:slug/settings` — UpdateSettingsDto (AdminAuthGuard)

3. Módulo `dashboard`:
   - `GET /api/:slug/dashboard/overview`:
     - Pedidos hoje (count), receita hoje (sum), ticket médio, nota média de feedback, mensagens IA hoje, custo IA hoje
   - `GET /api/:slug/dashboard/orders?from=xxx&to=xxx&status=xxx` — paginado
   - `GET /api/:slug/dashboard/payments?from=xxx&to=xxx` — paginado
   - `GET /api/:slug/dashboard/ai-usage?from=xxx&to=xxx` — mensagens/dia, custo/dia, bloqueios/dia, model breakdown
   - `GET /api/:slug/dashboard/feedback?from=xxx&to=xxx` — ratings + comentários paginados
   - `GET /api/:slug/dashboard/customers` — lista com total_visits, total_spent, last_visit_at

4. Módulo `menu` (admin endpoints):
   - CRUD categorias: create, update, reorder, deactivate
   - CRUD itens: create, update, deactivate, toggle availability/featured/day_special
   - CRUD extras: create, update, deactivate
   - Upload de imagem: retorna presigned URL do S3/R2 → front faz upload direto → salva URL no item

5. Módulo `table-session` (admin endpoints):
   - CRUD mesas: create, update, deactivate
   - `GET /api/:slug/tables/:id/qr-code` — gera QR Code PNG com URL assinada (HMAC)
   - `GET /api/:slug/tables/status` — lista de mesas com status atual (available/occupied)

6. Auth admin:
   - `POST /api/:slug/admin/login` — email + senha → JWT
   - `admin-auth.guard.ts` — valida JWT com role owner/manager

### Frontend (web-staff):

7. `/login/page.tsx`:
   - Toggle: "Sou garçom/cozinha" (PIN) vs "Sou gerente/dono" (email+senha)
   - Redireciona por role: waiter → /garcom, kitchen → /cozinha, manager/owner → /dashboard

8. `/dashboard/page.tsx`:
   - MetricCards: pedidos, receita, ticket médio, nota média, uso IA
   - Charts com recharts: receita/dia, pedidos/dia

9. `/dashboard/cardapio/page.tsx`:
   - DataTable de categorias com drag-to-reorder
   - DataTable de itens com filtro por categoria, toggle available/featured
   - Modal/page de edição com upload de foto

10. `/dashboard/mesas/page.tsx`:
    - Grid de mesas com status visual
    - Criar mesa → gera QR Code automaticamente
    - Botão download QR Code (PNG)

11. `/dashboard/equipe/page.tsx`:
    - DataTable de staff com role, status, ações
    - Modal criar/editar com campo de PIN

12. `/dashboard/pedidos/page.tsx`:
    - DataTable com filtros (data, status, mesa)
    - Drill-down com itens + notes + timeline de status

13. `/dashboard/pagamentos/page.tsx`:
    - DataTable com filtros (data, status, método)

14. `/dashboard/ia/page.tsx`:
    - Chart: mensagens/dia e custo/dia
    - Chart: % bloqueadas vs permitidas
    - Tabela: últimas mensagens com model_used, was_blocked, custo

15. `/dashboard/feedback/page.tsx`:
    - Média geral + médias por categoria
    - Lista de feedbacks com rating + comentário + data

16. `/dashboard/clientes/page.tsx`:
    - DataTable: nome, CPF (parcial), visitas, gasto total, última visita
    - Drill-down: histórico de visitas + itens consumidos

17. `/dashboard/configuracoes/page.tsx`:
    - Formulário de branding: cores (color picker), fontes (dropdown), logo (upload)
    - Formulário de IA: system prompt customizado, max mensagens/sessão
    - Formulário PSP: provider, chave API, chave Pix
    - Preview em tempo real do branding

---

## Sprint 8 — Polish + Testes + Deploy

**Agentes:** `devops.md`, `architect.md`

### Tarefas:

1. Testes E2E:
   - Fluxo completo: QR → popup → home → cardápio → pedido → KDS → entrega → pagamento → feedback
   - Fluxo garçom: login PIN → lançar pedido → claim entrega
   - Fluxo assistente: mensagem válida → resposta, mensagem inválida → bloqueio
   - Multi-tenant: criar 2 tenants, verificar isolamento total

2. Testes de carga:
   - 50 conexões WebSocket simultâneas no KDS
   - 100 requests/min no assistente com rate limit ativo

3. Segurança:
   - Rate limit global (express-rate-limit ou NestJS throttler)
   - Validação de todos os inputs (class-validator já cobre)
   - CORS configurado por domínio
   - Helmet headers
   - CSP policy

4. Performance:
   - Lazy loading de imagens no cardápio
   - Cache de cardápio no Redis (TTL 5min)
   - Debounce no chat (500ms)
   - Cache de banco com TypeORM

5. PWA básico:
   - manifest.json pra web-staff (garçom pode "Add to Home Screen")
   - Service worker básico pra offline fallback

6. Deploy:
   - web-customer → Vercel (domínio principal)
   - web-staff → Vercel (subdomínio: admin.dominio.com)
   - api → Railway (auto-deploy do main branch)
   - ai-service → Railway (container Python)
   - Redis → Upstash
   - PostgreSQL → Neon ou Supabase
   - Storage → Cloudflare R2

7. Domínio + SSL + DNS configurados.

8. Criar tenant de produção pro primeiro restaurante real.

9. Script de onboarding: `create-tenant.sh` que cria tudo com um comando.
