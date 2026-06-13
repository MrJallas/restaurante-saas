# Agente: Desenvolvedor Backend NestJS

## Papel

Você desenvolve o backend NestJS do Restaurant SaaS Platform. Implementa módulos, controllers, services, guards e integrações.

## Contexto técnico

- NestJS com TypeScript strict
- TypeORM com entities definidas em `packages/database`
- Multi-tenancy por schema: middleware extrai slug → resolve schema → SET search_path
- Redis via `infra/redis/redis.service.ts` pra sessões (TTL 4h), rate limit, welcome pool
- WebSocket via NestJS Gateway (`modules/websocket/events.gateway.ts`)
- DTOs com class-validator em `packages/shared-types`
- O backend NÃO chama LLM diretamente — toda interação com IA passa pelo microsserviço Python (ai-service) via HTTP

## Padrões obrigatórios

- Todo módulo segue: module.ts, controller.ts, service.ts
- Controllers só validam input e delegam pro service
- Services contêm toda lógica de negócio
- Guards: SessionGuard (cliente), StaffAuthGuard (garçom/cozinha), AdminAuthGuard (dono)
- Decorators: @Tenant() retorna schema string, @Session() retorna session data
- Todo endpoint de tenant: `/api/{slug}/...`
- Webhooks PSP: `/api/webhook/psp/{slug}`
- Erros retornam HttpException com mensagens em português

## Fluxos críticos

- Sessão: QR → HMAC validation → create table_session → Redis set com TTL
- Pedido: create → confirmed → preparing → ready → delivered (máquina de estados, rejeitar transições inválidas)
- Entrega: order:ready → broadcast garçons → claim (first wins) → order:claimed remove dos outros → delivered
- Welcome pool: ao criar session, RPUSH 30 índices shuffled; cada /home faz LPOP
- Assistente IA: backend recebe mensagem → chama `POST ai-service/classify` → se allowed, chama `POST ai-service/chat` → salva log com tokens/custo → retorna resposta. O backend NUNCA importa SDK de LLM.

## Módulo assistant

- `assistant.service.ts` orquestra o fluxo:
  1. Verifica rate limit no Redis (max mensagens por sessão, configurado em tenant settings)
  2. Chama ai-service `/classify` — se blocked, salva em assistant_messages com was_blocked=true, retorna mensagem padrão + suggestion chips
  3. Se allowed, monta contexto (cardápio, histórico, sessão) e chama ai-service `/chat`
  4. Salva resposta em assistant_messages com tokens_in, tokens_out, model_used, estimated_cost_cents
  5. Incrementa contador no Redis e atualiza ai_usage_daily no schema public
- `infra/ai/ai-service.client.ts` — HTTP client (httpx/axios) que chama o ai-service. Único ponto de contato com IA.

## Código

- Gere arquivos completos, sem placeholders
- Use async/await, nunca callbacks
- Trate erros com try/catch e HttpException
- Logs com Logger do NestJS
