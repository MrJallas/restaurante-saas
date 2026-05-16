# Manager · Financeiro — placeholder confirmado

**Rota:** `/manager/financeiro?slug=restaurant_dev&staffId=…&managerId=…`
**Arquivo:** `apps/web-staff/src/app/manager/financeiro/page.tsx` (148 linhas)
**Screenshot:** `screenshots/01-financeiro.png`

## Status: NÃO IMPLEMENTADO · placeholder visual

A página é **100% estática** — não faz nenhuma chamada de API relacionada a finanças.

### Conteúdo renderizado
- `MAppHeader` (greeting "Boa noite, Renata Albuquerque" · pulse "AO VIVO · TURNO DA NOITE")
- Bloco "Em desenvolvimento" com copy: "Painel financeiro chega em breve · Faturamento por período, ticket médio, comparativo com semana anterior, breakdown por forma de pagamento e exportação. Depende da integração com o PSP (PIX / cartão)."
- 4 `PreviewBox` em grid 2×2 (Faturamento hoje · Ticket médio · Mesas servidas · Tempo de mesa) — todos com valor `—` e `opacity: 0.55`.
- CTA "Voltar ao Painel" (router.push('/manager'))
- `MBottomNav active="finance"`

### Network capturada (Playwright)
Filtro `api|financ|payment|revenue|kpi` → **zero** chamadas a endpoint financeiro.
Apenas polling do MAppHeader (zone-pauses, complaints, late-arrival-requests, table-merge-requests, lgpd-requests, staff) que não tocam payment/order totals.

## Onda 4 backend? Sim, parcialmente existe — não wired.

### Módulos relevantes encontrados
| Path | Status | Observação |
|---|---|---|
| `apps/api/src/modules/payments/payments.controller.ts` | EXISTE | `@Post /` (create), `@Post /:paymentId/confirm`, split compute/notify, `@Get /`. NÃO expõe KPI agregado. |
| `apps/api/src/modules/dashboard/dashboard.controller.ts` | EXISTE | `@Get overview`, `@Get revenue`, `@Get top-items`, `@Get feedback-summary`, `@Get ai-usage`. Tem queries SQL agregadas em `dashboard.service.ts` (count + SUM total_cents de orders por dia). |
| `apps/web-staff/src/lib/api/manager.ts` | INCOMPLETO | Não declara binding pra `dashboardApi`. Não há `manager(slug).financial` ou similar. |

### Cross-check do dado real
```sql
SELECT SUM(amount_cents) FROM restaurant_dev.payments WHERE status='confirmed';
-- sum: 34830 (R$ 348,30)
```
Há dado real em DB. O `dashboard.service` faz `SELECT COUNT(*), SUM(total_cents) FROM orders` por dia, mas a página `/manager/financeiro` **não consome** nenhum desses endpoints — tudo é placeholder com `—`.

## Resumo
- KPIs (revenue/ticket/breakdown) na UI = **mock literal** (caractere `—`).
- Backend `dashboardApi` existe (Onda 4 parcial) mas **não está wired** na manager UI.
- O comentário top-of-file deixa explícito: *"Quebra o link 404 do MBottomNav. O módulo financeiro real depende de integração POS + payment provider (PIX/cartão) que está fora do escopo da stack atual."*

## Recomendação
Wirar `dashboardApi.revenue/overview` em `FinanceiroInner` ou marcar o caminho como dependência de épico futuro (PSP). Hoje a tela é honesta sobre não ter dado — sem regressão visual.
