# apps/web-staff — app da equipe

App web da operação do restaurante: recepção, garçom, cozinha, bar, gerente e dono, além das telas de
TV da cozinha e do bar. Next.js 16 com React 18, Tailwind 3, `recharts` (gráficos do gerente) e
`socket.io-client`.

## Como roda

- **No Compose** (serviço `web-staff`, container `restaurant-web-staff`), porta **3002**. A raiz `/`
  redireciona para `/login`.
- **Login:** CPF + PIN em `/login` (`POST /:slug/staff-auth/login` na API). Depois do login, cada papel
  cai na sua área (`homeForStaffRole` em `src/lib/api.ts`): dono e gerente em `/manager`, recepção em
  `/host`, garçom em `/waiter`, cozinha em `/cozinha`, bar em `/bar`, caixa em `/cashier`. Recuperação e
  troca de PIN em `/forgot` e `/trocar-pin`. O restaurante vem de `NEXT_PUBLIC_TENANT_SLUG`
  (`restaurant_dev` no Compose).
- **Proxy no servidor (BFF):** toda chamada HTTP do navegador vai para `/api/proxy/...`
  (`src/app/api/proxy/[...path]/route.ts`), que lê o cookie httpOnly `staff_token`, envia
  `x-staff-token` e injeta a `STAFF_API_KEY` **no servidor**. A chave nunca entra no JavaScript do
  navegador ([ADR 0007](../../docs/decisoes/0007-proteger-sessoes-com-token-derivado-e-bff-da-equipe.md)).
  O `/socket.io` é repassado pelo `next.config.js` para `STAFF_API_BASE_URL`.
- **TVs:** `/cozinha/tv` e `/bar/tv`. Com `TV_ACCESS_PIN` definido, `src/proxy.ts` exige o cookie
  `tv_pin` e manda para `/cozinha/unlock`, que valida o PIN em `POST /api/tv-unlock`. Sem PIN, as TVs
  abrem em desenvolvimento; em produção/staging o proxy bloqueia as chamadas de dados das TVs.
- `src/proxy.ts` também gera a Content-Security-Policy com nonce a cada requisição.
- **Isolado:** `STAFF_API_BASE_URL=http://localhost:3001/api` e a mesma `STAFF_API_KEY` da API
  `[NÃO VERIFICADO]`.

## Scripts

| Script             | O que faz                                           |
| ------------------ | --------------------------------------------------- |
| `dev`              | `next dev --port 3002`                              |
| `build` / `start`  | build e servidor de produção do Next                |
| `test`             | Jest (`next/jest`, jsdom), `src/**/*.test.{ts,tsx}` |
| `lint`, `lint:fix` | ESLint                                              |

## Variáveis que lê

`STAFF_API_BASE_URL`, `STAFF_API_KEY` (só no servidor), `TV_ACCESS_PIN`, `NEXT_PUBLIC_TENANT_SLUG`
(com `NEXT_PUBLIC_DEFAULT_TENANT` como alternativa), `NEXT_PUBLIC_TENANT_ID`, `NEXT_PUBLIC_WS_URL`,
`PUBLIC_HOST`, `NODE_ENV` e `VERCEL_ENV`. Nunca use `NEXT_PUBLIC_STAFF_API_KEY`. Ver
[ambiente local](../../docs/desenvolvimento/ambiente-local.md) e [staging](../../docs/operacao/staging.md).

## Estrutura

```
src/
├── app/          # rotas: login, forgot, trocar-pin, host, waiter, cozinha, bar, manager, cashier,
│                 #   dashboard (legado), garcom/pedidos (redireciona), api/proxy e api/tv-unlock
├── screens/      # telas de recepção, garçom e gerente
├── components/   # gerente, garçom, TV, push e o banner de erro operacional
├── hooks/, lib/  # cliente HTTP via proxy, sessão da equipe, socket compartilhado
└── proxy.ts      # CSP por requisição e PIN das TVs
__tests__/        # smoke manual de CORS
```

`/cashier` ainda não liquida pagamentos: mostra "Caixa ainda não ativado".

## Testes

- 22 arquivos Jest em `src/`.
- Fora do Jest, rodados à mão: `__tests__/smoke-cors.test.ts` (preflight de CORS da origem `:3002`;
  `node --test --import tsx apps/web-staff/__tests__/smoke-cors.test.ts` com a API no ar) e
  `src/lib/api.identity.spec.ts` (spec ts-node legado).

Ver [testes](../../docs/desenvolvimento/testes.md).

## Documentação relacionada

- [Jornadas e telas](../../docs/produto/jornadas-e-telas.md)
- [Autenticação e sessões](../../docs/arquitetura/autenticacao-e-sessoes.md)
- [Ciclo do pedido](../../docs/arquitetura/ciclo-do-pedido.md) (KDS por estação)
- [Modelo de segurança](../../docs/seguranca/modelo-de-seguranca.md)
