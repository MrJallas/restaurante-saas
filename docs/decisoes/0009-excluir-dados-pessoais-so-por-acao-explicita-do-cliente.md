---
status: aceita
date: 2026-07-11
decision-makers: Caleb Medeiros
---

# Excluir dados pessoais só por ação explícita do cliente

## Contexto e problema

Pela LGPD, o cliente pode pedir que seus dados sejam apagados. O pedido costuma surgir na conversa com
o assistente, mas a exclusão é irreversível. O serviço de IA não consegue provar que um humano
aprovou: o `customer_id` que recebe é só contexto, e ele não tem o cookie httpOnly que autentica o
cliente. Um modelo induzido pelo texto, ou que alucine, poderia disparar a exclusão sozinho.

## Opções consideradas

- a ferramenta do assistente executa a exclusão depois de um "sim" no chat ou de um toque no chip
  (comportamento até julho de 2026);
- a ferramenta só devolve uma ação para a tela, e a exclusão sai de um botão de confirmação fora do
  chat, autenticado pelo cookie.

## Decisão

Escolhida: "só o botão fora do chat apaga", porque a exclusão passa a depender de um ato humano
autenticado, fora do alcance do texto que o modelo lê.

- A ferramenta `lgpd_data_request` do assistente nunca chama o backend, não gera protocolo e não diz
  que algo foi apagado; ela devolve uma ação para o navegador.
- O botão de confirmação do app do cliente chama `POST /:slug/lgpd-requests`. A API identifica o
  cliente pelo cookie `recognition_token`, nunca pelo corpo. Se algum armazenamento falhar, responde
  503 e o pedido fica pendente; o gerente pode repetir por `POST /:slug/lgpd-requests/:id/retry`.
- Concorrência (migration 079): cada tentativa reivindica o pedido com um token próprio e um prazo
  (lease); só quem reivindicou conclui ou devolve o pedido (compare-and-set).
- Ao concluir, a API anonimiza o cadastro e rotaciona o `recognition_token` na mesma transação,
  invalida o cache desse token no Redis e desconecta os sockets do cliente.
- O mesmo princípio vale para apagar conversas do histórico: a confirmação só vale vinda do toque no
  chip, nunca de um campo gerado pelo LLM.

### Consequências

- Boa, porque nenhum texto na conversa apaga dados.
- Boa, porque falha parcial não aparece como sucesso para o cliente.
- Ruim, porque ainda não há processamento em segundo plano: um pedido que falhou depende da nova
  tentativa manual do gerente.
- Ruim, porque, com o login só por CPF
  ([ADR 0006](0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md)), quem souber o CPF de
  alguém pode pedir a exclusão daquele perfil.

## Mais informações

- Datas: confirmação por origem para apagar conversas no commit `ac2660d` (2026-07-04); pedido LGPD
  só fora do chat e migration 079 na auditoria integral de 2026-07-11, commitados em 2026-07-17
  (`e7e54c0`).
- `apps/api/src/modules/lgpd/` e `services/ai-service/services/tools/lgpd_data_request.py`
- [Histórico de chat e LGPD](../produto/funcionalidades/historico-de-chat-e-lgpd.md)
