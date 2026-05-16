# /manager/timeline/[orderId] — diagnostico passo-a-passo

Subagente 16 / Audit R23 / Order timeline.

## Componente

- Page: `apps/web-staff/src/app/manager/timeline/[orderId]/page.tsx`
- Screen: `apps/web-staff/src/screens/manager/ScreenManagerTableTimeline.tsx`

## Test setup

| Order ID testado | `2777b898-b072-4ba0-85dd-2ae75e682070` |
|---|---|
| URL | `/manager/timeline/2777b898-...?slug=restaurant_dev` |
| Persona | Manager Erica |
| Live screenshot | `screenshots/12-timeline-mock.png` |

DB seed:

```sql
SELECT id, status, total_cents, created_at FROM restaurant_dev.orders
 ORDER BY created_at DESC LIMIT 1;
-- 2777b898-...|cancelled|1990|2026-05-12 11:37:18.529622+00
```

## DOM probe (Playwright)

```json
{
  "href": "http://localhost:3002/manager/timeline/2777b898-.../?slug=restaurant_dev",
  "snippet": "Mesa 11 · timeline 28′ CRÍTICA Pedido em preparo há 16 min — meta 12 min · Garçom: Olivia M. · R$ 156,00 O QUE FAZER AGORA Verifique a cozinha — pergunte se o prato está pronto. Avise um garçom pra levar o pedido assim que sair. Fale com o cliente — explique que já está saindo. ETAPAS DO PEDIDO Pedido feito 20:42 6 itens · R$ 156,00 Confirmado 20:42 auto · 24s Δ 0.4 min Cozinha começou 20:54 meta: 2 min · ⚠ excedeu Δ 12 min Em preparo — há 16 min · meta 12 min Δ 16 min Pronto — Entregue na mesa — CHAMADOS DE GARÇOM Cliente chamou garçom (água) 20:50 Resolvido em 3 min ...",
  "buttons": ["Avisar cozinha","Cortesia","Painel","Operação","Equipe","Financeiro","Eu"]
}
```

## Etapas renderizadas (todas MOCK)

`ScreenManagerTableTimeline.tsx:40-47` define `DEFAULT_STEPS`:

| # | Label | Tempo | Δ | Status | Meta |
|---|---|---|---|---|---|
| 1 | Pedido feito | 20:42 | -- | done | 6 itens, R$ 156,00 |
| 2 | Confirmado | 20:42 | 0.4 min | done | auto, 24s |
| 3 | Cozinha começou | 20:54 | 12 min | **slow** | meta 2 min, ⚠ excedeu |
| 4 | Em preparo | -- | 16 min | **open** | há 16 min, meta 12 min |
| 5 | Pronto | -- | -- | wait | -- |
| 6 | Entregue na mesa | -- | -- | wait | -- |

Cores: `done=#1E8C5A`, `slow=#D98E2B`, `open=#C43A3A`, `wait=borderSoft`.

Hero (`Mesa 11`): `28' CRÍTICA · Pedido em preparo há 16 min — meta 12 min · Garçom: Olivia M. · R$ 156,00`. **Sem relação com o `orderId` real**.

## DB real — `order_status_history`

Schema: `id, order_id, from_status, to_status, changed_by, created_at`.

```sql
SELECT order_id, from_status, to_status, created_at
  FROM order_status_history
 WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 3)
 ORDER BY order_id, created_at;
```

Resultado (3 orders recentes):

```
2777b898-... | null               | pending_confirmation | 2026-05-12 11:37:18.529622+00
2777b898-... | pending_confirmation | cancelled         | 2026-05-12 11:37:21.256671+00

4814c285-... | null               | pending_confirmation | 2026-05-09 03:26:50.526618+00
4814c285-... | pending_confirmation | received           | 2026-05-09 03:26:56.994904+00
4814c285-... | received           | cancelled            | 2026-05-09 03:29:05.601722+00

f9bb2fe6-... | null               | pending_confirmation | 2026-05-09 03:25:22.542702+00
f9bb2fe6-... | pending_confirmation | received           | 2026-05-09 03:25:36.307643+00
f9bb2fe6-... | received           | in_progress         | 2026-05-09 03:29:22.210114+00
f9bb2fe6-... | in_progress        | ready               | 2026-05-09 03:29:22.251705+00
```

Fluxo observado: `null -> pending_confirmation -> received -> in_progress -> ready -> served`. Status `served` nao apareceu em nenhum order recente (todos cancelled ou parados em `ready`).

## Gap UI ↔ DB

Source `ScreenManagerTableTimeline.tsx:62`:

```tsx
orderId: _orderId,  // <- prefixo `_` indica nao usado
```

O componente **nao usa** o `orderId` da URL para fetch. Sempre renderiza
`DEFAULT_STEPS`. Comentario lines 8-14:

> Backend (TODO Onda 4):
>   • GET /orders/:id/timeline → etapas + tempos reais
>   • GET /tables/:id/calls → chamados do garçom

Mapping mock vs real:

| Mock label | Status real DB |
|---|---|
| Pedido feito | (pre-insert) |
| Confirmado | pending_confirmation → received |
| Cozinha começou | received → in_progress |
| Em preparo | in_progress |
| Pronto | in_progress → ready |
| Entregue na mesa | ready → served |

## Acoes da timeline (stub)

Source `ScreenManagerTableTimeline.tsx:67-71`:

```tsx
const showStub = (m: string) => {
  setStubMsg(`${m} · em desenvolvimento (Onda 4 backend).`);
  setTimeout(() => setStubMsg(null), 2800);
};
```

Botoes:

- `Avisar cozinha` — stub toast.
- `Cortesia` — funcional, `router.push('/manager/compensate')`. Unica acao com navigation real.

## Status

**PARTIAL** — UI renderiza, layout V11/V13 correto, mas:

- Dados sao MOCK (DEFAULT_STEPS hardcoded, orderId ignorado).
- Backend `/orders/:id/timeline` nao implementado (marcado Onda 4 TODO).
- DB `order_status_history` ja tem todos os dados necessarios para
  derivar steps reais (status, timestamps, changed_by).

Recomendacao: implementar `GET /:slug/orders/:id/timeline` retornando
array de eventos do `order_status_history` mapeado para os 6 labels.
