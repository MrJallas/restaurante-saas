# Staging para o beta

Modelo de staging do beta (decisão Caleb #10): **dois tenants** vivem no
mesmo Postgres de staging.

| Schema         | Slug   | Nome                 | Papel                                                                    |
| -------------- | ------ | -------------------- | ------------------------------------------------------------------------ |
| `staging_demo` | `demo` | Restaurante Showcase | Tenant DEMO — mostrar o produto ao cliente antes de onboardar.           |
| `staging_beta` | `beta` | Beta — a definir     | CASCA do tenant REAL do restaurante beta. Nome/menu reais no onboarding. |

O router resolve `:slug` via
`SELECT id, schema_name, is_active FROM public.restaurants WHERE slug = $1`
(`apps/api/.../tenant/tenant.middleware.ts`). Um schema **não registrado em
`public.restaurants` é invisível ao router** — por isso `create-tenant.ts`
agora faz o UPSERT desse registro no final (ver abaixo).

## Provisionar

Aponte `DATABASE_URL` pro Postgres de staging e rode:

```bash
cd packages/database
DATABASE_URL=postgresql://<user>:<pass>@<host>:<port>/<db> npm run provision:staging
# equivalente: npx ts-node scripts/provision-staging.ts
```

O script é **idempotente** — re-run não duplica:

- `createTenant` usa `CREATE SCHEMA IF NOT EXISTS` + tracking em
  `__migrations__` + UPSERT `ON CONFLICT (slug)` em `public.restaurants`.
- O seed de showcase (só o `staging_demo`) usa `WHERE NOT EXISTS` / `ON
CONFLICT`, então re-rodar não gera linhas duplicadas.

### O que cada tenant recebe

- **Ambos**: schema + todas as migrations do `tenant-template` + seeds
  default (categorias Entradas/Principais/Bebidas/Sobremesas, settings) +
  registro em `public.restaurants` (com um plano `Starter` default garantido
  em `public.plans` se a tabela estiver vazia).
- **`staging_demo` (showcase)** também recebe um seed **mínimo** pra ter algo
  visível na tela: 1 categoria "Destaques da Casa", 2 itens (Bruschetta,
  Risoto), 2 mesas (`D1`, `D2`) e 1 manager "Gerente Showcase" com **PIN
  1234** (hash SHA-256, igual ao `staff-pin.util`). Trocar o PIN antes de
  qualquer exposição externa.
- **`staging_beta`** fica só na casca — sem menu/staff de showcase. O menu,
  as mesas e a equipe reais entram no onboarding do cliente.

> `create-tenant.ts` ganhou args opcionais `--slug` e `--name` pra registrar
> qualquer tenant novo diretamente:
> `npm run create-tenant -- <schema> --slug <slug> --name "<Nome>"`.

## Config / secrets: staging vs dev

Staging **não** é dev. Os defaults locais que destravam o ambiente são
inseguros expostos. Setar no ambiente da API (`apps/api`) e do web-staff:

| Env                         | Dev (local)                                           | Staging (obrigatório)                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAFF_API_KEY`             | vazio / `<chave-de-dev-antiga-bloqueada-em-producao>` | **segredo forte único**. `NODE_ENV=production` faz o boot abortar se ausente ou se for o literal committado (`assert-staff-key.ts`).                                                                        |
| `NEXT_PUBLIC_STAFF_API_KEY` | —                                                     | **NUNCA setar**. A key saiu do bundle no épico de auth; hoje só vive server-side no proxy `apps/web-staff/.../api/proxy` como `STAFF_API_KEY`. Prefixo `NEXT_PUBLIC_` a vazaria pro JS do browser.          |
| `STAFF_SESSION_REQUIRED`    | `false` (fallback `x-staff-id` legado ligado)         | Gate #34 é **automático e fail-closed** em `NODE_ENV=production`, `APP_ENV=staging` ou Vercel preview/production. Definir `true` continua útil para antecipar o gate em dev; nenhum deploy pode desligá-lo. |
| `TV_ACCESS_PIN`             | não setado (TV KDS pública, no-op)                    | **setar um PIN**. Sem ele, as rotas de TV/KDS ficam abertas (`proxy route` e `web-staff/middleware.ts` tratam ausência como dev no-op).                                                                     |
| `CORS_ORIGINS`              | default `http://localhost:3003,3002`                  | **domínios de staging** (CSV). Honrado por `main.ts` (HTTP) e `events.gateway.ts` (WebSocket).                                                                                                              |
| `NODE_ENV`                  | `development`                                         | `production` (ativa os fail-fast de `STAFF_API_KEY` e `secure` nos cookies).                                                                                                                                |

## Checklist de go-live do beta

1. **Provisionar** os 2 tenants: `npm run provision:staging` (idempotente).
2. **Migrations aplicadas em todos os tenants**: o boot da API roda
   `migrate-tenants.ts` antes de subir (wirado no `command` do serviço `api`
   em `docker-compose.yml`). Confirmar nos logs `[migrate-tenants] OK`.
3. **Secrets setados** conforme a tabela acima — em especial `STAFF_API_KEY`
   forte, `TV_ACCESS_PIN`, `CORS_ORIGINS`; confirme nos testes que o gate
   automático de sessão staff está ativo no ambiente de deploy.
   `NUNCA` `NEXT_PUBLIC_STAFF_API_KEY`.
4. **Boot fail-fast passou**: a API sobe sem `STAFF_API_KEY nao configurada`
   nem `usa o default committado` (`assert-staff-key.ts`).
5. **Router enxerga os tenants**: `GET /demo/...` e `/beta/...` resolvem
   (linha em `public.restaurants` com `is_active = true`).
6. **Timeline íntegra**: rodar `apps/api/scripts/verify-timeline.ts` contra o
   banco de staging — a session-timeline deve reconstruir sem furos.
7. **Troca de PIN do showcase**: trocar o PIN default `1234` do "Gerente
   Showcase" antes de qualquer demo externa.
8. **Onboarding do beta**: quando o cliente real entrar, preencher `name`,
   menu, mesas e staff reais no `staging_beta` (a casca já está provisionada).
