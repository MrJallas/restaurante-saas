# Continuação — Gerente timeline real de pedido/mesa

## Contexto

Este é o monorepo `restauranteSaaS`. A tela do gerente de timeline de mesa/pedido existe visualmente em `apps/web-staff`, mas ainda usa dados mockados apesar de o backend já ter endpoint de timeline de pedido.

Source-of-truth visual:

- `docs/design-canvas/handoff/garcom/garcom-screens-d.jsx`
- `docs/design-canvas/handoff/garcom/garcom-app.jsx`
- `apps/web-staff/src/screens/manager/ScreenManagerTableTimeline.tsx`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Logs/históricos novos vão para MongoDB, não Postgres. Aqui o histórico operacional de pedido já existe em Postgres (`order_status_history`); não criar uma tabela nova de log em Postgres.
- Migrations novas, se necessárias, devem ser idempotentes (`DO $$ ... IF NOT EXISTS`) e só se realmente necessárias.
- Erros para o usuário devem ser estruturados `{ message_user, code }`; não vazar string técnica.
- Não deixar toast/banner "em desenvolvimento" em tela final.

## Estado atual já encontrado

- Backend já expõe `GET /:slug/orders/:orderId/timeline` em `apps/api/src/modules/orders/orders.controller.ts`.
- O service `getOrderTimeline` lê `order_status_history` e resolve `byStaffName` por join com `staff`.
- Frontend `ScreenManagerTableTimeline` ainda tem `DEFAULT_STEPS`, `CALLS` e banner:

```txt
DADOS MOCK · timeline real chega na Onda 4 (GET /orders/{':id'}/timeline)
```

- O CTA "Avisar cozinha" ainda chama stub com toast `em desenvolvimento`.

## Comportamento esperado

Quando o gerente abre `/manager/timeline/[orderId]`:

1. A tela busca dados reais pelo `staffApi`, com `x-staff-id` e `x-staff-role` corretos.
2. O hero mostra mesa, status atual, atraso real, valor e responsável real quando disponíveis.
3. A linha do tempo mostra transições reais do pedido, em ordem cronológica.
4. Tempos/deltas são calculados a partir dos timestamps reais.
5. Chamados da mesa aparecem se houver endpoint/dado real; se não houver contrato claro, esconder o bloco em vez de manter mock.
6. "Avisar cozinha" só fica visível se disparar uma ação real. Se não houver endpoint determinístico, esconder esse botão nesta rodada.
7. "Cortesia" continua navegando para o fluxo real de cortesia/compensação.

## Implementação esperada

### 1. Frontend

Em `apps/web-staff/src/screens/manager/ScreenManagerTableTimeline.tsx`:

- Trocar `DEFAULT_STEPS` por estado carregado via API.
- Adicionar loading, empty-state e erro amigável.
- Remover banner de mock.
- Remover ou implementar o stub `showStub('Avisar cozinha')`.
- Garantir que `router.back()` continue preservando origem.
- Não quebrar mobile: CTAs devem continuar sticky acima do bottom nav.

Em `apps/web-staff/src/lib/api/manager.ts` ou helper equivalente:

- Criar função `getOrderTimeline(slug, orderId)` usando `staffGet`.
- Se precisar de resumo do pedido além da timeline, preferir enriquecer o endpoint existente em vez de criar endpoint paralelo sem motivo.

### 2. Backend

Se o shape atual de `GET /orders/:orderId/timeline` for insuficiente, enriquecer de forma compatível:

```ts
{
  orderId: string;
  tableNumber?: number;
  tableLabel?: string;
  totalCents?: number;
  currentStatus?: string;
  assignedStaffName?: string | null;
  events: Array<{
    event: string;
    at: string;
    byStaffId: string | null;
    byStaffName: string | null;
    fromStatus: string | null;
  }>;
}
```

Critérios:

- Endpoint deve ser staff-only ou manager-visible, nunca aberto para customer de outra mesa.
- Se `orderId` não existir, retornar `{ message_user, code }` amigável.
- Não retornar stack/SQL/`invalid uuid syntax` para a UI.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-staff
git diff --check
```

## Validação automatizada obrigatória

- Usar MCP Playwright/browser para abrir `/manager/timeline/[orderId]` com um `orderId` real.
- Logar como gerente real. Se o prompt `15` já tiver sido implementado, usar o superuser de gerente; antes disso, documentar o fallback de `localStorage`/query param usado.
- Capturar screenshot antes/depois ou screenshot final provando que o banner `DADOS MOCK` sumiu.
- Validar network/response do `GET /orders/:orderId/timeline` e conferir que os eventos renderizados batem com `order_status_history`.
- Se a tela for aberta a partir de uma mesa/Operação, validar também o clique de origem via Playwright, não só navegação direta por URL.
- Salvar evidências em `qa-reports/gerente-timeline-real/`.

Se houver ambiente Docker rodando, abrir a tela de timeline com um `orderId` real e validar:

1. Não aparece `DADOS MOCK`.
2. Não aparece `em desenvolvimento`.
3. Timeline muda quando o pedido muda de status.
4. Erro de auth não vaza como `manager-only endpoint`/`x-staff-id inválido`.

## Critérios de aceitação

- [ ] Tela usa timeline real do backend.
- [ ] Banner/mock removido.
- [ ] CTA sem backend real escondido ou implementado.
- [ ] Loading/erro/empty-state amigáveis.
- [ ] Build API e web-staff passam.
