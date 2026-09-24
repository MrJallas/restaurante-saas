---
status: aceita
date: 2026-07-11
decision-makers: Caleb Medeiros
---

# Aceitar login do cliente só por CPF, temporariamente

## Contexto e problema

O cliente se identifica com nome e CPF. O perfil (histórico, favoritos, pedidos anteriores) fica
ligado ao cookie httpOnly `recognition_token`. Depois do endurecimento de segurança, quem trocava de
aparelho ou apagava os cookies não conseguia recuperar o próprio perfil. CPF, porém, é identificador,
não segredo: não prova que quem digita é o dono.

## Opções consideradas

- prova de posse com código de uso único (OTP) enviado a telefone ou e-mail já verificado;
- confirmação presencial pela recepção ou pelo gerente;
- aceitar o CPF cadastrado como suficiente, com mitigação, até existir uma das duas acima.

## Decisão

Escolhida: "o CPF cadastrado autentica, temporariamente", porque as duas outras opções dependem de um
canal de envio ou de um processo presencial que ainda não existem.

- `POST /:slug/customer/welcome` e `POST /:slug/customer/identify` reconhecem o CPF cadastrado mesmo
  sem cookie e emitem o `recognition_token` canônico do perfil só em cookie httpOnly, nunca no corpo.
- Mitigação: `identify` limitado a 5 tentativas por IP em 15 min; `welcome` limitado a 30 por IP real
  e sessão de mesa (`CUSTOMER_WELCOME_RATE_*`), sem confiar em `X-Forwarded-For`. Cada
  reconhecimento sem o cookie anterior gera o log `customer_cpf_only_login_accepted`, com CPF
  mascarado. O isolamento por restaurante continua.

### Consequências

- Boa, porque o cliente recupera o perfil em qualquer aparelho sem cadastro novo.
- Ruim, porque quem souber o CPF de alguém pode assumir o perfil daquela pessoa naquele restaurante,
  ler histórico e dados pessoais e fazer ações pessoais, inclusive pedir exclusão de dados. É um risco
  alto, aceito conscientemente.
- Ruim, porque os aparelhos de um mesmo perfil compartilham o token: sair em um deles rotaciona a
  credencial e desconecta todos.
- A auditoria integral de 2026-07-11 fechou como **PARTIAL** (96/100 no critério técnico) só por
  causa deste risco.
- Saída prevista: OTP em canal verificado ou confirmação presencial, credencial por aparelho e remoção
  deste modo. Deve ser uma mudança explícita, com novo ADR, não uma alteração silenciosa.

## Mais informações

- Datas: decisão em 2026-07-11; o código foi commitado em 2026-07-17 (`e7e54c0`).
- `apps/api/src/modules/customers/customers.controller.ts` e `customers.service.ts`
- [Riscos aceitos e pendências](../seguranca/riscos-aceitos-e-pendencias.md)
- [Relatório final da auditoria de 2026-07-11](../archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md)
