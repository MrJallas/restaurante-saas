# Agente: Integrador & DevOps

## Papel
Você cuida de Docker, deploy, CI/CD, integrações externas (PSP, storage) e infraestrutura.

## Stack de infra
- Turborepo como monorepo manager
- Docker Compose local: PostgreSQL 16 + Redis 7
- Deploy: Vercel (frontends), Railway (api + ai-service), Upstash (Redis), Neon/Supabase (PostgreSQL)
- Storage: Cloudflare R2 ou S3 pra imagens de cardápio e logos

## Docker Compose (dev)
- postgres: porta 5432, volume persistente, initdb com schema public
- redis: porta 6379
- api: porta 3001, hot reload, depends_on postgres + redis
- ai-service: porta 8000, hot reload
- web-customer: porta 3000
- web-staff: porta 3002

## Variáveis de ambiente

### Globais
- DATABASE_URL
- REDIS_URL
- JWT_SECRET (pra auth admin/staff)
- AI_SERVICE_URL (http://localhost:8000 em dev)
- ENCRYPTION_MASTER_KEY (pra criptografia AES-256-GCM das chaves PSP dos tenants)

### Microsserviço de IA (ai-service)
- LLM_PROVIDER=openai              # openai | anthropic | google
- LLM_API_KEY=sk-xxx               # chave do provedor escolhido
- LLM_MODEL_MAIN=gpt-4o            # modelo principal pra chat
- LLM_MODEL_CLASSIFIER=gpt-4o-mini # modelo leve pra classificação de intenção

### PSP
- PSP_WEBHOOK_SECRET

### Storage
- S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY

**IMPORTANTE:** Nunca usar ANTHROPIC_API_KEY, OPENAI_API_KEY ou GOOGLE_API_KEY como nome de variável. Sempre usar o padrão genérico LLM_* pra manter o sistema provider-agnostic.

## Integrações
- PSP (Asaas/Woovi): cada tenant tem sua chave em settings.psp_api_key_encrypted
  - Criptografia: AES-256-GCM com ENCRYPTION_MASTER_KEY
  - Webhook: validar assinatura antes de processar
- Storage: upload via presigned URL, salvar URL no banco
- LLM: o ai-service é o único ponto de contato com provedores de IA. O backend NestJS NUNCA chama LLM diretamente.

## Scripts
- `create-tenant.sh`: wrapper que chama `create-tenant.ts` — cria schema, roda migrations, roda seeds
- `seed-tenant.sh`: popula dados de exemplo pra demos

## Regras
- Nunca commitar .env, chaves, ou secrets
- Logs estruturados (JSON) em produção
- Health checks em todos os serviços (/health)
- Graceful shutdown no NestJS e FastAPI
- Gere arquivos completos, sem placeholders
