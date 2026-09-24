# Cliente-anfitrião e mesa compartilhada

Esta página descreve quem decide quem entra numa mesa e como duas mesas se juntam. A regra de produto
é uma só: **decisão social da mesa é do cliente-anfitrião**. A equipe não aprova quem chega depois nem
junção de mesas. Das junções decididas ela recebe um aviso passivo na caixa de entrada da recepção;
da chegada tardia não recebe aviso nenhum (ver "O que a equipe vê").

## Conceito

| Termo             | O que é                                                                                             | Onde vive                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Sessão da mesa    | A ocupação atual da mesa. No máximo uma ativa por mesa (migration 064)                              | `table_sessions`                                  |
| Participante      | Cada cliente identificado que escaneou o QR daquela sessão                                          | `session_participants`                            |
| Cliente-anfitrião | O primeiro participante aprovado da sessão. Aprova quem chega depois e responde a pedidos de junção | `table_sessions.host_customer_id` (migration 017) |
| Recepcionista     | Papel de equipe `host` no app da equipe (`/host`). **Não é** o cliente-anfitrião                    | `staff.role = 'host'`                             |

O código chama os dois de "host". Nesta documentação, "cliente-anfitrião" é sempre o cliente e
"recepção" é sempre a equipe.

Estados de um participante (`apps/api/src/modules/table-session/table-session.service.ts`):

| Estado      | Significado                                                             |
| ----------- | ----------------------------------------------------------------------- |
| `pending`   | Pediu para entrar e espera uma decisão                                  |
| `approved`  | Está na mesa e usa o app normalmente                                    |
| `rejected`  | Foi recusado (pelo cliente-anfitrião ou, no primeiro scan, pela equipe) |
| `cancelled` | Desistiu do próprio pedido (migration 080)                              |

O cliente-anfitrião é definido uma vez: o código só grava `host_customer_id` quando ele ainda está
vazio. O único caminho que o limpa é a exclusão de dados pessoais
([histórico de chat e LGPD](historico-de-chat-e-lgpd.md)).

## Primeiro scan de uma mesa livre

O primeiro cliente de uma mesa livre não tem cliente-anfitrião para aprová-lo. Há dois caminhos:

1. **Mesa liberada antes pela recepção.** Em `/host/liberate/<mesa>` a recepção libera a mesa para
   o próximo grupo (`POST /:slug/host/tables/:tableNumber/liberate`). O primeiro scan em até 15 min
   consome essa liberação (`table_qr_releases`), entra `approved` e vira o cliente-anfitrião.
2. **Sem liberação.** O cliente entra `pending` e o backend cria uma verificação de scan
   (`scan_verification_requests`). A recepção vê o card "Verificar mesa escaneada" em `/host` e decide
   em `/host/scan-verification/<id>`. Cada nível tem 60 s; sem resposta, o pedido sobe para o gerente
   e depois para o garçom. Esgotada a cadeia (cerca de 3 min), o pedido expira, o participante fica
   `rejected` e a sessão é fechada. Aprovado, o cliente vira o cliente-anfitrião e a espera some sozinha.

O porquê dessa verificação está em
[ADR 0004](../../decisoes/0004-validar-o-primeiro-scan-do-qr-na-recepcao.md).

## Quem chega depois

Quando a mesa já tem sessão ativa e cliente-anfitrião, quem escaneia o QR depois passa por aqui:

| Etapa              | Como está implementado                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedido nasce       | `POST /:slug/customer/welcome` (ou `/recognize`) chama `TableSessionService.upsertParticipant`, que grava o participante como `pending`                     |
| Aviso ao anfitrião | Evento `participant:join_request` na sala da sessão. O app do anfitrião mostra um aviso na home e a tela `/[slug]/host/approve/participant`                 |
| Quem decide        | Só o cliente-anfitrião, por `POST /:slug/table/participants/decide`. Qualquer outro recebe 403 ("Apenas o host da mesa pode aprovar ou rejeitar entradas.") |
| Resultado chega    | Evento `participant:decision` e, como reforço, consulta a `GET /:slug/table/participants`                                                                   |
| Tela de espera     | `ScreenCustomerWaitingApproval`, montada dentro de `/[slug]/mesa/[tableCode]`                                                                               |
| Prazo              | Não existe. O pedido espera o anfitrião; nada expira sozinho                                                                                                |

A decisão usa uma troca atômica condicionada a `status = 'pending'`: duas decisões simultâneas não se
anulam e decidir de novo não inverte o resultado.

O anfitrião também pode responder pelo assistente ("pode entrar", "agora não"). Nesse caso a
decisão vem de uma comparação determinística da frase dele, feita antes de qualquer chamada ao LLM.
Se o LLM sugerir aceitar ou recusar a entrada, a sugestão é descartada (`_llm_may_decide_join`,
`services/ai-service/main.py`). Detalhes em [Serviço de IA](../../arquitetura/servico-de-ia.md).

A equipe nunca aprova chegada tardia. Um segundo mecanismo, que escalava o pedido para a recepção e o
gerente, existia no banco e foi removido pela migration 081 por contrariar essa regra. O porquê está
em [ADR 0005](../../decisoes/0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md).

## Desistir × ser recusado

A migration 080 separou dois casos que antes gravavam o mesmo estado:

- **Quem desiste** (`cancelled`, por `POST /:slug/table/participants/cancel`) pode escanear de novo. O
  novo scan cria outro pedido `pending` e o anfitrião é avisado outra vez.
- **Quem o anfitrião recusou** (`rejected`) continua barrado até a sessão da mesa fechar. Um novo scan
  não reabre o pedido nem incomoda o anfitrião de novo.

Registros `rejected` anteriores à migration 080 não foram reclassificados: não há como saber quem
desistiu e quem foi recusado.

## Junção de mesas

Duas mesas ocupadas podem se juntar se **os dois clientes-anfitriões aprovarem** (consentimento
duplo). Código: `apps/api/src/modules/table-merge/`.

1. **Pedido.** Um participante aprovado da mesa de origem pede a junção pelo app ou pelo assistente
   (ferramenta `request_table_merge`): `POST /:slug/table-merge-requests`. O backend recusa se a mesa
   de origem não tem anfitrião, se a mesa alvo não tem anfitrião (409) ou se as duas são a mesma
   mesa (400). Quando quem pede é o próprio anfitrião da origem, a aprovação dele já fica registrada.
2. **Consentimento duplo.** Cada anfitrião aprova em `POST /:slug/table-merge-requests/:id/approve`
   (tela `/[slug]/host/approve/merge`). O pedido só vira `approved` quando os dois lados aprovaram. A
   troca de estado é um único `UPDATE` no banco, para que duas aprovações simultâneas não se percam
   (migration 036). Qualquer lado recusa em `.../reject`.
3. **Prazo (TTL).** O pedido vale 60 s (`REQUEST_TTL_SECONDS` em `merge-consent-state-machine.ts`).
   Depois disso a varredura periódica o marca como `expired` e avisa as duas mesas com o evento
   `table_merge.rejected` (motivo `timeout`).
4. **Cooldown.** Uma recusa bloqueia novos pedidos **da mesma origem para o mesmo alvo** por 10 min
   (`COOLDOWN_MINUTES`). O bloqueio é direcional (migration 037): a mesa recusada pode receber um
   pedido no sentido contrário. Durante o bloqueio, um novo pedido recebe 429 com o código
   `MERGE_COOLDOWN_ACTIVE` e o tempo restante.
5. **Override do gerente.** Gerente ou dono pode forçar a junção por
   `POST /:slug/staff/table-merges/force`, com motivo obrigatório. O override cria o pedido já
   aprovado, apaga o cooldown entre as duas mesas nos dois sentidos e registra a ação em
   `escalation_chains.steps`. Serve para quando o gerente confirmou pessoalmente com os dois
   anfitriões. Hoje nenhuma tela do app da equipe chama esse endpoint.

O que a aprovação faz hoje: grava o acordo, avisa as duas mesas e o app do cliente oferece a escolha
de comanda (individual ou da mesa). Nenhum código de pedido, conta ou pagamento lê
`table_merge_requests`: as duas sessões continuam separadas, e o mapa da equipe não mostra as mesas
como um conjunto.

## O que a equipe vê

Só avisos passivos, sem botão de aprovar:

- a caixa de entrada da recepção (`GET /:slug/host/inbox`) lista junções decididas (aprovadas,
  recusadas ou expiradas), reclamações e pausas de zona;
- a linha do tempo da sessão (`/manager/session-timeline/<id>`) registra pedidos e decisões.

A chegada tardia aprovada pelo anfitrião **não** gera aviso à equipe. O aviso passivo previsto no
desenho original não foi implementado.

## Divergências conhecidas

| Onde                                                                      | O que diz                                                                                              | O que o código faz                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto da tela de espera após recusa (`ScreenCustomerWaitingApproval.tsx`) | "Você pode tentar de novo em 20 min"                                                                   | Cooldown de 10 min. A tela tem o visual congelado ([ADR 0012](../../decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md)); mudar o texto é decisão de produto |
| Comentário de `COOLDOWN_MINUTES`                                          | Cooldown após recusa **ou** timeout                                                                    | Só a recusa grava cooldown; o timeout apenas expira o pedido                                                                                                                          |
| Desenho original da funcionalidade                                        | Aviso passivo à equipe depois de cada aprovação; override proibido; tabela `merge_cooldowns` de 20 min | Sem aviso de chegada tardia; override do gerente existe; tabela `table_merge_cooldowns`, 10 min                                                                                       |

## Referências de código

- `apps/api/src/modules/table-session/table-session.service.ts` (`upsertParticipant`,
  `decideJoinRequest`, `cancelOwnPendingJoin`) e `table.controller.ts`
- `apps/api/src/modules/scan-verification/scan-verification.service.ts`
- `apps/api/src/modules/table-merge/merge-consent-state-machine.ts`, `table-merge.service.ts`,
  `staff-table-merge.controller.ts`
- `apps/api/src/modules/jobs/ttl-tick.service.ts` (expiração de junções e da verificação de scan)
- Migrations `017`, `025`, `036`, `037`, `064`, `080` e `081` em
  `packages/database/migrations/tenant-template/`
- Telas: `apps/web-customer/src/screens/customer-host-flows/`
- Tempo real: [Tempo real](../../arquitetura/tempo-real.md)
