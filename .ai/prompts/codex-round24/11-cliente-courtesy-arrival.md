# Continuação — Cliente recebe cortesia real

## Contexto

Este é o monorepo `restauranteSaaS`. O gerente já consegue criar cortesias em `apps/api/src/modules/courtesies`, mas o cliente ainda não tem uma experiência real de "cortesia recebida": não aparece bubble dedicada, o cliente não aceita/recusa pelo app e a tool `view_courtesy` ainda retorna fallback porque não existe endpoint customer-side.

Source-of-truth visual:

- `docs/design-canvas-final/handoff/garcom/README.md` seção de cortesia recebida
- `docs/design-canvas/handoff/garcom/garcom-app.jsx`
- `apps/web-customer/src/components/ui/ManagerBubble.tsx`
- `apps/web-customer/src/components/ui/StaffBubble.tsx`
- `services/ai-service/services/tools/view_courtesy.py`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres.
- A tabela operacional `courtesies` já existe em Postgres; pode ser usada para estado da cortesia. Não criar tabela nova de histórico em Postgres.
- Migrations novas, se necessárias, devem ser idempotentes (`DO $$ ... IF NOT EXISTS`).
- Erros para o usuário devem ser estruturados `{ message_user, code }`; não vazar string técnica.

## Estado atual já encontrado

- `GET/POST /:slug/courtesies` existe, mas é manager-only.
- `POST /:slug/courtesies/:id/respond` existe, mas é staff-only.
- `CourtesiesService.create` persiste `table_session_id`, `table_number`, `type`, `item`, `status`.
- `view_courtesy.py` diz explicitamente que não existe endpoint dedicado e retorna fallback "chamar garçom".
- Customer UI tem bolhas de gerente/staff, mas não uma `CourtesyArrival` com aceite/recusa.

## Comportamento esperado

1. Gerente manda cortesia para uma mesa ativa.
2. Cliente da mesa recebe evento em tempo real.
3. Cliente vê uma bolha/card discreta de cortesia:
   - visual canônico: borda lateral mostarda, ícone/selo de presente, copy amigável;
   - mostra item/tipo, gerente quando disponível e estado `pendente`.
4. Cliente pode aceitar ou recusar pelo app.
5. Status muda no backend para `aceita` ou `recusada`.
6. Manager/garçom veem status atualizado.
7. Se o cliente recarregar, cortesias pendentes da mesa continuam visíveis.
8. A tool `view_courtesy` deixa de fingir que não existe endpoint.

## Implementação esperada

### 1. Backend customer-side

Adicionar endpoints protegidos por `SessionGuard`:

```http
GET  /:slug/customer/courtesies
POST /:slug/customer/courtesies/:id/respond
```

Shape sugerido:

```ts
{
  courtesies: Array<{
    id: string;
    tableSessionId: string;
    tableNumber: number | null;
    type: string;
    item: string;
    status: 'pendente' | 'aceita' | 'recusada';
    managerName: string | null;
    notes: string | null;
    createdAt: string;
    respondedAt: string | null;
  }>;
}
```

Critérios:

- Listar apenas cortesias da sessão do cookie (`SessionGuard`), nunca por `tableSessionId` vindo do browser.
- Se a cortesia foi criada só com `table_number`, resolver para a sessão ativa da mesa quando possível.
- Responder só se a cortesia pertence à sessão atual e está `pendente`.
- Retornar `{ message_user, code }` em erro de ownership/status.

### 2. WebSocket

Quando `CourtesiesService.create` criar uma cortesia com sessão resolvida:

- Emitir `courtesy.created` para `session:<tableSessionId>`.
- Opcional: emitir `courtesy.updated` quando cliente aceita/recusa.

Se registrar auditoria nova de entrega/leitura, usar MongoDB.

### 3. Frontend customer

Em `/[slug]/assistente` e/ou home da mesa:

- Escutar `courtesy.created` via socket.
- Renderizar `CourtesyArrival` ou componente equivalente.
- Buscar `GET /customer/courtesies` ao montar para recuperar pendentes após reload.
- CTAs:
  - `Aceitar` -> `POST .../respond { status: 'aceita' }`
  - `Recusar` -> `POST .../respond { status: 'recusada' }`
- Não usar alerta técnico/toast cru.

### 4. AI service `view_courtesy`

Não fazer HTTP server-side sem cookie de sessão.

Opções aceitáveis:

- Se o app API conseguir chamar a tool com contexto autenticado suficiente, alinhar a chamada com o novo endpoint.
- Caso contrário, a tool deve retornar `action_payload: { action: 'show_courtesies' }` para o frontend buscar `GET /customer/courtesies`.

Em ambos os casos, remover o texto "endpoint não existe" e manter chips canônicos.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-customer
python -m pytest services/ai-service/tests -q
git diff --check
```

## Validação automatizada obrigatória

- Usar MCP Playwright/browser no gerente para criar a cortesia real.
- Usar simulador iOS com idb do Facebook para o cliente receber a cortesia, aceitar/recusar e recarregar.
- Se a tool `view_courtesy` for alterada, testar pelo chat real do app com LLM local ligado; o servidor atual pode ser `http://<IP-da-LAN>:1234` com modelo `qwen/qwen3-coder-30b`, mas confirme antes de rodar.
- Conferir estado em `courtesies` e, se houver evento/histórico novo, confirmar que foi para MongoDB.
- Capturar screenshots iOS da chegada da cortesia e do estado pós-decisão; salvar em `qa-reports/courtesy-arrival/`.

Fluxo manual:

1. Cliente entra em mesa ativa.
2. Gerente cria cortesia para a mesa.
3. Cliente vê bubble/card sem refresh.
4. Cliente aceita.
5. Backend mostra `status='aceita'`.
6. Recarregar cliente não mostra pendente já aceita.

## Critérios de aceitação

- [ ] Cliente recebe cortesia em tempo real.
- [ ] Reload recupera cortesias pendentes.
- [ ] Cliente aceita/recusa pelo app.
- [ ] `view_courtesy` não retorna fallback de endpoint inexistente.
- [ ] Sem vazamento técnico em erros.
