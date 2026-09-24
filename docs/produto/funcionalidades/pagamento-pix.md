# Pagamento e Pix

O cliente fecha a conta pelo celular. A conta, a taxa de serviço e a divisão são calculadas de
verdade no backend. O **Pix é uma demonstração**: nenhum dinheiro é cobrado e nenhum banco é
consultado. Isso é decisão de produto, não defeito
([ADR 0008](../../decisoes/0008-manter-o-pix-como-demonstracao.md)).

## Estado atual

| Parte                                                             | Estado                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Conta com subtotal, desconto de promoção, taxa de serviço e total | Real, calculada no backend (`GET /api/:slug/orders/bill`)                                            |
| Divisão da conta (igual, por item, valores livres)                | Real, calculada no backend (`POST /api/:slug/payments/bill/split/compute`)                           |
| Registro do pagamento e trava contra cobrança dupla               | Real (`POST /api/:slug/payments`)                                                                    |
| Pix (QR e copia-e-cola)                                           | **Demonstração**. A tela mostra o selo "Pagamento simulado · nenhum valor será cobrado"              |
| Cartão                                                            | Fora da lista de formas de pagamento desde 2026-07-04                                                |
| Dinheiro ou pagamento no caixa                                    | Não existe no app do cliente. A tela `/cashier` da equipe é só um aviso de "caixa ainda não ativado" |

Na tela de formas de pagamento (`/[slug]/pagamento`) só aparece o Pix, com a legenda "QR Code ·
simulado nesta versão".

## Comanda da mesa × minha comanda

Ao adicionar um item, o cliente escolhe em qual comanda ele entra. Cada pedido grava
`billing_mode`:

| Modo                         | Quem paga                                      |
| ---------------------------- | ---------------------------------------------- |
| `table` (comanda da mesa)    | Entra na conta compartilhada da mesa           |
| `individual` (minha comanda) | Entra na comanda de quem pediu (a visita dele) |

Um carrinho com itens das duas comandas vira dois pedidos, um por modo. Na hora de pagar, cada
escopo tem o próprio total devido (`apps/api/src/modules/payments/payments.service.ts`):

- **conta da mesa**: pedidos em comanda da mesa;
- **comanda individual**: pedidos em comanda individual do cliente identificado;
- **parte do rateio**: o cliente paga a parte dele na divisão da conta da mesa, e o valor abate o
  devido da mesa.

Quem paga "a minha parte" é identificado pelo cookie `recognition_token` no servidor, nunca por um
id enviado pelo app. O total devido desconta o que já foi pago e também o Pix que está aguardando
compensação, para não cobrar duas vezes. Pagamentos simultâneos do mesmo escopo são serializados
(testes `payments.service.concurrent-double-charge.test.ts` e
`payments.service.split-canonical.test.ts`).

## Taxa de serviço e rateio no backend

O `BillingService` (`apps/api/src/modules/billing/billing.service.ts`) é a única fonte de verdade da
conta:

- lê a taxa de `settings.service_fee_pct` (migration 050); valor ausente ou inválido vale 10%;
- aplica o desconto da promoção ativa que der o **maior** desconto (promoções não somam) e que
  respeite a janela de validade e o pedido mínimo;
- `GET /orders/bill` e `POST /payments` usam o mesmo cálculo, então o valor mostrado é o valor
  cobrado.

O app do cliente não calcula taxa nem desconto. O motivo (a taxa de 10% existia só na tela) está em
[ADR 0011](../../decisoes/0011-calcular-taxa-de-servico-e-rateio-da-mesa-no-backend.md).

## Por que o Pix é demonstração

Integrar Pix de verdade exige CNPJ, conta num provedor de pagamentos (PSP), credenciais e custo por
transação. Sem um restaurante cliente, o projeto não tem esses itens. O que existe hoje:

| Camada                                                                  | Estado                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tabela `payments` e estados `pending → awaiting_settlement → confirmed` | Real                                                                                    |
| QR e copia-e-cola                                                       | Texto gerado pelo próprio backend; não é um BR Code emitido por banco. Expira em 10 min |
| `POST /api/:slug/payments/:id/confirm`                                  | Grava só `awaiting_settlement` ("aguardando compensação"), nunca `confirmed`            |
| Webhook de PSP                                                          | Não existe                                                                              |
| Integração com PSP                                                      | Não existe (nenhum SDK ou chamada HTTP a PSP no repositório)                            |

A confirmação pelo próprio cliente só marca o pagamento como pago se
`PAYMENTS_ALLOW_CLIENT_CONFIRM=true` e o ambiente **não** for de produção, staging ou preview
(`clientConfirmMarksPaid` em `payments.service.ts`). O `docker-compose.yml` não define essa variável:
no ambiente local o Pix também para em `awaiting_settlement`. Sem essa regra, qualquer cliente
poderia marcar o próprio Pix como pago sem pagar.

Consequência para a demonstração: nenhuma conta termina "quitada"; os indicadores de faturamento do
gerente só somam pagamentos `confirmed` ou `paid` (`apps/api/src/modules/dashboard/dashboard.service.ts`).

## Como integrar um provedor

O desenho atual permite ligar um PSP sem reescrever a máquina de estados:

1. **Provedor de Pix** em `apps/api/src/modules/payments/`: cria a cobrança na API Pix do PSP e grava
   o BR Code real no lugar do texto de demonstração.
2. **Webhook**: rota nova que recebe o aviso do PSP, confere valor, identificador da cobrança
   (`txid`) e identificador da transação (`endToEndId`) e só então marca `confirmed`. É o único jeito
   automático de saber que o dinheiro chegou.
3. **Baixa manual pela equipe** (opcional, provisória): uma rota autorizada para o caixa ou o gerente
   confirmar o Pix olhando o extrato do banco.
4. **Painel financeiro**: decidir se `awaiting_settlement` aparece como pendente no faturamento.

Pré-requisitos fora do código: CNPJ ou MEI, conta no PSP, credenciais (token ou certificado) e um
endereço HTTPS público para o webhook. Os PSPs considerados no planejamento diferem em exigência de
certificado mTLS e existência de ambiente de testes.

## Referências de código

- `apps/api/src/modules/billing/billing.service.ts`
- `apps/api/src/modules/payments/payments.service.ts` e `payments.controller.ts`
- `apps/web-customer/src/app/[slug]/pagamento/page.tsx`, `pagamento/pix/page.tsx` e
  `pagamento/dividir/page.tsx`
- Migrations `012_create_payments.sql`, `050_customer_geofence_and_fee.sql` e
  `073_bill_split_notifications.sql`
