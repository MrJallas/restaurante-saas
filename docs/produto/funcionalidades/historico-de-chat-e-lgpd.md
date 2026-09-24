# Histórico de chat e LGPD

O cliente identificado pode rever as conversas que teve com o assistente, apagá-las e pedir a
exclusão dos seus dados pessoais. A exclusão só acontece por uma ação explícita do cliente no app,
nunca por decisão do assistente
([ADR 0009](../../decisoes/0009-excluir-dados-pessoais-so-por-acao-explicita-do-cliente.md)).

## O que é guardado

| Dado                                         | Onde                                                                        | Para quê                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Conversas com o assistente, por cliente      | MongoDB, banco `restaurant_chat`, coleções `chat_threads` e `chat_messages` | Histórico que o cliente consulta em `/[slug]/chat-history` |
| Mensagens da sessão de mesa com o assistente | PostgreSQL, tabela `assistant_messages` do restaurante                      | Contexto da conversa em andamento e respostas da equipe    |
| Pedidos de exclusão (protocolos)             | PostgreSQL, tabela `lgpd_requests` (migrations 022 e 079)                   | Comprovante e controle da execução                         |

Só cliente identificado (com `recognition_token`) tem histórico no MongoDB. Se o MongoDB estiver
fora do ar, a conversa segue e o turno simplesmente não é gravado no histórico.

## Retenção

- **30 dias.** Cada conversa e cada mensagem recebem `expiresAt` = momento da gravação + 30 dias
  (`DEFAULT_TTL_DAYS` em `apps/api/src/modules/chat-history/chat-history.service.ts`). Um índice TTL do
  MongoDB apaga o documento depois dessa data. A conversa conta os 30 dias a partir de quando foi
  criada.
- **Índice garantido duas vezes**: pelo `packages/database/mongo-init.js` no primeiro boot do volume
  e pela própria API na primeira gravação, para volumes criados antes do script. Os dois usam o mesmo
  nome (`expiresAt_ttl`); a API aceita o nome antigo (`expiresAt_1`) de volumes anteriores.
- **No máximo 80 conversas por cliente.** Ao criar a 81ª, as mais antigas são apagadas.
- **No máximo 50 mensagens por sessão de mesa** com o assistente; depois disso a API responde que o
  limite foi atingido (`MAX_MESSAGES_PER_SESSION` em `assistant.service.ts`).

## Onde fica

Os documentos do MongoDB usam nomes em camelCase (`threadId`, `customerId`, `tenantId`,
`lastMessageAt`, `expiresAt`). Um esquema antigo com nomes em snake_case está arquivado em
[2026-06-mongodb-chat-threads-schema-antigo.md](../../archive/2026-06-mongodb-chat-threads-schema-antigo.md)
e não vale mais. Visão geral dos bancos:
[Dados e armazenamento](../../arquitetura/dados-e-armazenamento.md).

## O cliente vê e apaga o histórico

Rotas sob `/api/:slug/chat-history`, todas com sessão de mesa e com o dono resolvido pelo cookie
`recognition_token`:

| Rota                                           | O que faz                           |
| ---------------------------------------------- | ----------------------------------- |
| `GET /chat-history/threads`                    | Lista as conversas do cliente       |
| `GET /chat-history/threads/:threadId/messages` | Abre uma conversa (somente leitura) |
| `DELETE /chat-history/threads/:threadId`       | Apaga uma conversa                  |
| `DELETE /chat-history`                         | Apaga todas as conversas do MongoDB |

Telas: `/[slug]/chat-history`, `/[slug]/chat-history/[threadId]` e a opção de apagar conversas em
`/[slug]/eu`. Essas ações apagam **só o histórico de conversas**. Não são o pedido de exclusão
LGPD descrito abaixo.

## Pedido de exclusão (LGPD)

### Caminho único: o botão de confirmação

1. O cliente fala do assunto no assistente ("quero apagar meus dados"). O assistente mostra o aviso
   canônico com dois botões (seção "O que o assistente faz").
2. O cliente toca "Sim, quero excluir". O **próprio app** (não o assistente) chama
   `POST /api/:slug/lgpd-requests` com `kind: 'erasure'`
   (`apps/web-customer/src/app/[slug]/assistente/page.tsx`, `handleLgpdConfirm`).
3. A API identifica o cliente pelo cookie httpOnly `recognition_token`. Id, CPF ou e-mail enviados
   no corpo são ignorados. Sem cookie válido: 401.
4. Deu certo: o app mostra a confirmação canônica e o número do protocolo.

Se a exclusão não termina, a API responde 503 e o protocolo fica pendente. Gerente ou dono podem
repetir a execução por `POST /api/:slug/lgpd-requests/:id/retry`
(`apps/api/src/modules/lgpd/lgpd.controller.ts`). Ainda não há rotina automática de nova tentativa.

### O que a exclusão faz

A ordem é fixa (`apps/api/src/modules/lgpd/lgpd.service.ts`):

1. O protocolo é gravado como `pending` antes de qualquer efeito.
2. A execução reivindica o protocolo com um **lease** (prazo de posse) e um token de tentativa
   (migration 079, `LGPD_ERASURE_LEASE_SECONDS`, padrão 300 s). Só a tentativa dona do token conclui
   ou devolve o protocolo; uma tentativa que morreu é retomada depois que o lease vence.
3. MongoDB: apaga as conversas com o assistente e as mensagens com a equipe e confere que não sobrou
   nada.
4. PostgreSQL, numa transação: apaga `assistant_messages` e o resumo de consumo do cliente,
   anonimiza o cadastro e limpa textos livres identificáveis (avaliações, reclamações, eventos). Tabelas
   operacionais com chave estrangeira obrigatória (participações, pedidos de junção, verificações de
   scan, rateios) continuam apontando para o id do cliente, agora anônimo.
5. Na mesma transação, o `recognition_token` é trocado e o protocolo vira `fulfilled`.
6. Depois: evento `lgpd.request_fulfilled`, remoção do cache do token no Redis e desconexão dos
   sockets do cliente.

Qualquer falha antes do passo 5 deixa o protocolo `pending`, sem declarar sucesso.

## O que o assistente faz

O assistente **nunca** escreve texto sobre LGPD por conta própria e **nunca** apaga dados:

- `show_lgpd_notice` (`services/ai-service/services/tools/show_lgpd_notice.py`) devolve o aviso
  canônico e os dois botões. O app desenha a bolha e cuida dos dois botões.
- `lgpd_data_request` (`services/ai-service/services/tools/lgpd_data_request.py`) só devolve para a
  tela uma ação `lgpd_request_in_browser` com status `not_executed`. Não chama o backend, não cria
  protocolo e não afirma que algo foi apagado. Sem cliente identificado, devolve o texto de
  identificação obrigatória.
- O serviço de IA não tem o cookie do cliente, então não conseguiria provar que um humano confirmou
  uma ação irreversível. Por isso a execução fica com o app e a API.

## Textos canônicos

Os textos abaixo são a fonte. O módulo `services/ai-service/services/lgpd_messages.py` os copia
byte a byte e o teste `services/ai-service/tests/test_lgpd_messages.py` impede que o módulo se afaste
de `LGPD_NOTICE`, `LGPD_ERASURE_CONFIRMATION` e dos dois rótulos dos botões (`LGPD_REQUIRES_LOGIN`
ainda não tem teste). Mudar um texto exige mudar este documento, o módulo e o teste no mesmo commit.

```text
LGPD_NOTICE: Você, como consumidor, tem direito por lei (LGPD) de pedir a exclusão dos seus dados a qualquer momento. Posso encaminhar sua solicitação pra gerência?
LGPD_ERASURE_CONFIRMATION: Suas conversas foram apagadas agora. Protocolo guardado por 90 dias caso você precise de comprovante.
LGPD_CHIP_CONFIRM: Sim, quero excluir
LGPD_CHIP_DISMISS: Não, não quero excluir
LGPD_REQUIRES_LOGIN: Pra apagar suas conversas, preciso te identificar primeiro. Faça login na próxima visita pra ver e gerenciar seu histórico.
```

| Constante                                 | Quando aparece                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `LGPD_NOTICE`                             | Aviso mostrado quando o cliente fala de exclusão ou direitos LGPD                                                   |
| `LGPD_ERASURE_CONFIRMATION`               | Confirmação depois que a exclusão termina (o app repete o texto)                                                    |
| `LGPD_CHIP_CONFIRM` / `LGPD_CHIP_DISMISS` | Rótulos dos dois botões do aviso; ao confirmar, o app grava o rótulo nas notas do protocolo (`lgpd_requests.notes`) |
| `LGPD_REQUIRES_LOGIN`                     | Cliente sem identificação                                                                                           |

## Divergências conhecidas

| Tema                               | Situação                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto da confirmação               | Diz "suas conversas foram apagadas", mas a exclusão também anonimiza o cadastro e outros dados no PostgreSQL                                                                             |
| Protocolo "guardado por 90 dias"   | Nenhuma rotina apaga protocolos depois de 90 dias; a tabela `lgpd_requests` não tem prazo                                                                                                |
| "Apagar conversas" em `/[slug]/eu` | Usa `DELETE /chat-history`, não o pedido de exclusão LGPD                                                                                                                                |
| Texto antigo deste documento       | Dizia que o assistente chamava a exclusão e que ela tocava só as conversas. O código atual faz o contrário: o assistente não executa nada e a exclusão cobre MongoDB, PostgreSQL e Redis |

## Referências de código

- `apps/api/src/modules/lgpd/` (controller, serviço e testes de honestidade e de MongoDB)
- `apps/api/src/modules/chat-history/`
- `services/ai-service/services/lgpd_messages.py` e `services/ai-service/services/tools/`
- `packages/database/migrations/tenant-template/022_create_lgpd_requests.sql` e
  `079_lgpd_erasure_processing_lease.sql`
- Segurança em geral: [Modelo de segurança](../../seguranca/modelo-de-seguranca.md)
