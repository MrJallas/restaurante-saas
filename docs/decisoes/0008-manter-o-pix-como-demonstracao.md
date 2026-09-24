---
status: aceita
date: 2026-07-04
decision-makers: Caleb Medeiros
---

# Manter o Pix como demonstração

## Contexto e problema

Receber Pix de verdade exige CNPJ, conta num provedor de pagamento (PSP), credenciais, custo por
transação e uma URL pública para o webhook que avisa quando o dinheiro cai. O projeto não tem
restaurante cliente nem implantação em produção. Ao mesmo tempo, as auditorias apontavam "Pix sem
estado final de sucesso" como defeito.

## Opções consideradas

- integrar um PSP já;
- manter um fluxo de demonstração honesto: máquina de estados real, sem dinheiro de verdade.

## Decisão

Escolhida: "Pix como demonstração até existir o primeiro restaurante cliente", porque integrar um
PSP antes disso é custo sem uso, e a escolha do PSP depende do cliente.

- A tela `/[slug]/pagamento/pix` mostra QR e copia-e-cola gerados localmente pela API (não é um BR
  Code de banco), com o selo "Pagamento simulado · nenhum valor será cobrado".
- `POST /:slug/payments/:id/confirm`, chamado pelo cliente, grava só `awaiting_settlement`, nunca
  `confirmed`. A confirmação automática só existe fora de produção e com
  `PAYMENTS_ALLOW_CLIENT_CONFIRM=true`, variável que só os testes ligam.
- Cartão saiu da tela de pagamento; a alternativa real é pagar presencialmente com o garçom.

### Consequências

- Boa, porque o cliente não consegue marcar o próprio Pix como pago sem pagar.
- Boa, porque a máquina de estados (`pending → awaiting_settlement → confirmed`) não muda quando
  houver PSP: entram um provedor que gera o BR Code real e um webhook que confirma.
- Ruim, porque nenhum pagamento Pix chega a `confirmed` no ambiente do repositório, e ainda não
  existe baixa manual pela equipe.
- Auditoria que apontar "Pix sem sucesso final" está vendo o comportamento esperado.

## Mais informações

- `apps/api/src/modules/payments/payments.service.ts` (cabeçalho e `clientConfirmMarksPaid`) e
  `apps/web-customer/src/app/[slug]/pagamento/pix/page.tsx`
- [Pagamento e Pix](../produto/funcionalidades/pagamento-pix.md), com o caminho para integrar um PSP
