# Restaurant SaaS — Setup & Deployment

Multi-tenant restaurant platform: customer mobile menu, waiter tools, KDS kitchen TV, and owner dashboard.

## Stack

- **Monorepo**: Turborepo + npm workspaces
- **API**: NestJS + TypeORM (PostgreSQL with schema-per-tenant)
- **Customer app**: Next.js 14 App Router (port 3003)
- **Staff app**: Next.js 14 App Router (port 3002)
- **AI service**: FastAPI + Uvicorn (provider-agnostic LLM)
- **Cache/Queue**: Redis
- **Realtime**: Socket.IO via NestJS WebSocket gateway

## Ports

| Service      | Port |
| ------------ | ---- |
| PostgreSQL   | 5434 |
| Redis        | 6380 |
| API          | 3001 |
| web-staff    | 3002 |
| web-customer | 3003 |
| ai-service   | 8000 |

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11+ (for AI service)
- Docker + docker-compose (for Postgres + Redis)

## Quick start

```bash
# 1. Infra
docker-compose up -d postgres redis

# 2. Install
npm install

# 3. Migrate tenant-template + seed dev tenant
npm run db:migrate
npm run db:seed

# 4. AI service (separate terminal)
cd services/ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set LLM_PROVIDER + API key
uvicorn main:app --reload --port 8000

# 5. Run all apps (turbo)
npm run dev
```

## Environment variables

### apps/api (.env)

```
DATABASE_URL=postgresql://restaurant:restaurant@localhost:5434/restaurant_saas
REDIS_URL=redis://localhost:6380
QR_HMAC_SECRET=change-me
AI_SERVICE_URL=http://localhost:8000
PORT=3001
```

### apps/web-customer (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

### apps/web-staff (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_TENANT_SLUG=restaurant_dev
```

### services/ai-service (.env)

```
LLM_PROVIDER=openai          # openai | anthropic | google
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

## Health & readiness

- `GET /api/health` — liveness (just returns ok)
- `GET /api/ready` — checks Postgres + Redis connectivity

## Route map

### Customer (`apps/web-customer`)

- `/[slug]` — welcome + call waiter
- `/[slug]/cardapio` — menu with categories and search
- `/[slug]/cardapio/[itemId]` — item detail with **Comanda da mesa** vs **Minha comanda** buttons
- `/[slug]/pedido` — active orders (table view + individual view)
- `/[slug]/assistente` — AI chat
- `/[slug]/pagamento` — bill + PIX + feedback

### Staff (`apps/web-staff`)

- `/garcom/pedidos` — waiter order list
- `/cozinha` — KDS kanban (received / preparing / ready)
- `/dashboard` — owner KPIs + revenue chart
- `/dashboard/promocoes` — promotions CRUD
- `/dashboard/funcionarios` — staff CRUD

## Multi-tenancy

Each tenant has its own Postgres schema. `TenantMiddleware` resolves `:slug` from the URL and runs `SET search_path` before each query. To create a new tenant:

```bash
npm run tenant:create -- --slug new_restaurant --name "New Restaurant"
```

## Custom feature: billing mode at order time

When a customer opens a menu item, they choose between two buttons:

- **Comanda da mesa** — order is billed to the table's shared visit
- **Minha comanda** — order is billed to the customer's individual visit (requires identification)

This is recorded on each order via `billing_mode` ∈ `{table, individual}` and `visit_id`. At payment time, the bill is computed per-mode.

## Sprints

| Sprint | Focus                              | Branch                          |
| ------ | ---------------------------------- | ------------------------------- |
| 0      | Monorepo + infra                   | `sprint-0/setup`                |
| 1      | Auth + QR + tenant middleware      | `sprint-1/auth-qr`              |
| 2      | Home + welcome pool + call waiter  | `sprint-2/home-call`            |
| 3      | Menu + orders + billing mode       | `sprint-3/cardapio-pedido`      |
| 4      | KDS + WebSocket + waiter alerts    | `sprint-4/kds-websocket-garcom` |
| 5      | AI assistant (guardrails + LLM)    | `sprint-5/assistente-ia`        |
| 6      | Payment + feedback                 | `sprint-6/pagamento-feedback`   |
| 7      | Owner dashboard + promotions       | `sprint-7/dashboard-promocoes`  |
| 8      | Staff management + health + deploy | `sprint-8/staff-deploy`         |
