---
status: aceita
date: 2026-07-04
decision-makers: Caleb Medeiros
---

# Calcular taxa de serviço e rateio da mesa no backend

## Contexto e problema

A auditoria de 2026-07-03 achou um defeito de dinheiro: a taxa de serviço de 10% existia só no app do
cliente, como constante no front, e a coluna `settings.service_fee_pct` (migration 050) nunca era
lida. A tela podia mostrar um total e o pagamento cobrar outro. Na divisão da conta, o rateio da mesa
era uma prévia calculada no navegador, e "pagar minha parte" não cobrava exatamente aquela parte.

## Decisão

Escolhida: "o backend é a única fonte de taxa, desconto, total e rateio", porque valor cobrado não pode
depender de cálculo feito no navegador.

- `BillingService` (`apps/api/src/modules/billing/`) lê `settings.service_fee_pct` (10 se ausente ou
  inválido), aplica o desconto da melhor promoção ativa (promoções não se somam; regra de 2026-07-05)
  e calcula subtotal, taxa e total. `GET /:slug/orders/bill` (exibição) e `POST /:slug/payments`
  (cobrança) usam o mesmo cálculo.
- Divisão da conta: o backend rateia a conta da mesa, com taxa, entre os participantes aprovados da
  sessão, lidos no servidor e nunca do corpo da requisição. "Pagar minha parte" só aceita exatamente a
  parte calculada, e quem paga é identificado pelo cookie `recognition_token`.
- Liquidação: uma trava por mesa no Redis e a reserva do valor de pagamentos pendentes impedem
  cobrança dupla quando duas pessoas pagam ao mesmo tempo.

### Consequências

- Boa, porque tela e cobrança mostram o mesmo número; o front só exibe o texto da taxa.
- Boa, porque rateio, cobrança dupla sequencial e cobrança dupla concorrente têm testes próprios.
- Ruim, porque o driver do PostgreSQL devolve `NUMERIC` e `SUM` como texto; a conversão fica num lugar
  só, no `BillingService`, e os testes imitam o driver.
- Ruim, porque o rateio vale para a conta da mesa (`billing_mode='table'`); pedidos em comanda
  individual ficam fora dele.
- A tela de divisão ainda monta prévias locais com a porcentagem recebida do backend; o valor cobrado
  é sempre o do servidor.

## Mais informações

- Data: commit `fd4d7fe` (2026-07-04, "taxa server-side, split por reconhecimento").
- `apps/api/src/modules/billing/billing.service.ts`, `billing.module.ts`
- Testes: `apps/api/src/modules/payments/payments.service.split-canonical.test.ts`,
  `payments.service.concurrent-double-charge.test.ts`, `payments.service.fee-split.test.ts`
- [Pagamento e Pix](../produto/funcionalidades/pagamento-pix.md)
