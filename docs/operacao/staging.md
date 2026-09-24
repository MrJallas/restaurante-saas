# Staging para o beta

Plano de ambiente para o primeiro restaurante beta. **Não existe staging no ar**, e o repositório não
tem caminho de produção pronto: o `docker-compose.yml` é de desenvolvimento e não há Dockerfile para a
API nem para os fronts. Este documento registra como provisionar os restaurantes e o que precisa mudar
na configuração antes de expor o sistema.

O modelo são **dois restaurantes** no mesmo Postgres de staging, sem cadastro self-service:

| Schema         | Slug   | Nome                 | Papel                                                                   |
| -------------- | ------ | -------------------- | ----------------------------------------------------------------------- |
| `staging_demo` | `demo` | Restaurante Showcase | demonstração do produto para o cliente antes do onboarding              |
| `staging_beta` | `beta` | Beta — a definir     | casca do restaurante real; nome, cardápio, mesas e equipe no onboarding |

A API resolve o `:slug` com
`SELECT id, schema_name, is_active FROM public.restaurants WHERE slug = $1`
(`apps/api/src/modules/tenant/tenant.middleware.ts`). Um schema que não está em `public.restaurants` é
invisível para as rotas; por isso o `create-tenant.ts` faz o UPSERT desse registro no final.

## Provisionar

Aponte `DATABASE_URL` para o Postgres de staging e rode:

```bash
cd packages/database
DATABASE_URL=postgresql://<usuario>:<senha>@<host>:<porta>/<banco> npm run provision:staging
# equivalente: npx ts-node scripts/provision-staging.ts
```

O script (`packages/database/scripts/provision-staging.ts`) é **idempotente**:

- a criação de cada restaurante usa `CREATE SCHEMA IF NOT EXISTS`, a tabela `__migrations__` e
  `ON CONFLICT (slug)` em `public.restaurants`;
- o seed de demonstração usa `WHERE NOT EXISTS` / `ON CONFLICT`, então rodar de novo não duplica linhas.

### O que cada restaurante recebe

- **Os dois:** schema com todas as migrations do `tenant-template`, os seeds padrão (categorias e
  configurações) e o registro em `public.restaurants` (com um plano `Starter` criado se `public.plans`
  estiver vazia).
- **`staging_demo`:** um seed mínimo para ter o que mostrar: a categoria "Destaques da Casa", 2 pratos,
  2 mesas (`D1`, `D2`) e o gerente "Gerente Showcase" com o PIN de demonstração `1234`.
- **`staging_beta`:** só a casca.

Observações sobre o gerente de demonstração:

- O script grava o PIN como hash SHA-256 (formato legado). O login aceita esse formato e regrava o hash
  com bcrypt no primeiro acesso (`apps/api/src/modules/staff-auth/staff-auth.service.ts`). Troque o PIN
  antes de qualquer exposição externa.
- O script não grava CPF para esse gerente, e o login da equipe é por CPF + PIN. Cadastre um CPF antes
  de usar `/login` `[NÃO VERIFICADO em execução]`.

Para registrar outro restaurante:
`npm run create-tenant -- <schema> --slug <slug> --name "<Nome>"`.

## Configuração: staging × desenvolvimento

Os defaults que destravam o ambiente local são inseguros quando expostos. Em staging, configure a API,
o serviço de IA e o web-staff assim (lista completa de variáveis em
[ambiente local](../desenvolvimento/ambiente-local.md#variáveis-de-ambiente)):

| Variável                    | Desenvolvimento                                                                                             | Staging                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                  | `development`                                                                                               | `production`: liga os bloqueios de boot abaixo                                                                                                                                                         |
| `STAFF_API_KEY`             | valor aleatório no `.env`                                                                                   | segredo forte e único. Em produção a API aborta se faltar ou se for a chave antiga que já esteve no repositório (`KNOWN_LEAKED_STAFF_KEY`, em `apps/api/src/common/config/assert-staff-key.ts`)        |
| `SESSION_TOKEN_SECRET`      | valor aleatório no `.env`                                                                                   | segredo forte e único. Em produção a API aborta se faltar; defaults públicos conhecidos são recusados sempre (`apps/api/src/common/auth/session-auth-token.ts`)                                        |
| `AI_SERVICE_API_KEY`        | default de desenvolvimento do Compose                                                                       | segredo forte. Sem ele, o serviço de IA recusa as chamadas quando `ENV`/`NODE_ENV` é `production` ou `staging`                                                                                         |
| `NEXT_PUBLIC_STAFF_API_KEY` | não existe                                                                                                  | **nunca definir**: o prefixo `NEXT_PUBLIC_` embute o valor no JavaScript do navegador. A chave vive só no servidor, injetada pelo proxy `apps/web-staff/src/app/api/proxy/[...path]/route.ts`          |
| `STAFF_SESSION_REQUIRED`    | `false` (aceita o `x-staff-id` legado)                                                                      | irrelevante: com `NODE_ENV=production` ou `APP_ENV`/`VERCEL_ENV` em `production`, `preview` ou `staging`, só o token de sessão da equipe é aceito (`apps/api/src/common/guards/staff-auth-context.ts`) |
| `TV_ACCESS_PIN`             | vazio: TVs abertas, com aviso no log                                                                        | **definir um PIN.** Com PIN, as páginas `/cozinha/tv` e `/bar/tv` pedem o PIN (`apps/web-staff/src/proxy.ts`). Sem PIN em produção/staging, o proxy do web-staff bloqueia as chamadas de dados das TVs |
| `CORS_ORIGINS`              | `http://localhost:3003,http://localhost:3002`, mais as mesmas portas em `PUBLIC_HOST` (definido no compose) | domínios de staging (CSV). Vale para HTTP (`apps/api/src/main.ts`) e WebSocket (`events.gateway.ts`)                                                                                                   |
| `CUSTOMER_APP_URL`          | `http://<PUBLIC_HOST>:3003`                                                                                 | endereço público do app do cliente (destino do redirect do QR)                                                                                                                                         |

Cookies: a API marca `secure` quando a requisição chega por HTTPS; o web-staff, quando
`NODE_ENV=production`.

## Checklist de go-live do beta

1. **Provisionar** os dois restaurantes: `npm run provision:staging`.
2. **Migrations em todos os restaurantes**: rodar `packages/database/scripts/migrate-tenants.ts` antes
   de subir a API (no Compose de desenvolvimento isso está no comando do serviço `api`) e conferir no
   log `[migrate-tenants] OK · applied=… skipped=…`.
3. **Segredos** conforme a tabela acima: `STAFF_API_KEY`, `SESSION_TOKEN_SECRET`,
   `AI_SERVICE_API_KEY` e `TV_ACCESS_PIN` fortes; `CORS_ORIGINS` e `CUSTOMER_APP_URL` com os domínios
   reais. Nunca `NEXT_PUBLIC_STAFF_API_KEY`.
4. **Boot sem erro de segredo**: a API sobe sem `STAFF_API_KEY nao configurada` nem
   `SESSION_TOKEN_SECRET nao configurada`.
5. **Rotas enxergam os restaurantes**: `GET /api/demo/...` e `/api/beta/...` respondem (linha em
   `public.restaurants` com `is_active = true`).
6. **Linha do tempo íntegra**: de dentro do container da API, com `cwd` na raiz do repositório,
   `npx ts-node apps/api/scripts/verify-timeline.ts --tenant demo` (só leitura; `--heal` corrige).
7. **Gerente de demonstração**: CPF cadastrado e PIN trocado antes de qualquer demonstração externa.
8. **Onboarding do beta**: preencher nome, cardápio, mesas e equipe reais no `staging_beta`.

Riscos que continuam aceitos mesmo em staging (login do cliente só por CPF, Pix de demonstração, push
sem provedor) estão em [riscos aceitos e pendências](../seguranca/riscos-aceitos-e-pendencias.md).
