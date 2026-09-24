# Tempo real (Socket.IO)

O que acontece numa tela chega às outras pelo Socket.IO: pedido novo na cozinha, prato pronto no
garçom, resposta do gerente no celular do cliente. A API tem um único gateway; os dois apps se
conectam a ele pela própria origem.

## Gateway

- `EventsGateway` (`apps/api/src/modules/websocket/events.gateway.ts`), namespace `/`, caminho padrão
  `/socket.io`, CORS pela mesma `CORS_ORIGINS` do HTTP. O módulo é global: qualquer serviço injeta o
  gateway e emite eventos.
- Os envios ficam em `events-emitter.service.ts`. Esse emissor também grava cada evento relevante na
  linha do tempo da sessão no MongoDB ([Dados e armazenamento](dados-e-armazenamento.md)).
- Os apps não falam direto com a porta 3001: o Next de cada app reescreve `/socket.io` para a API
  (`next.config.js`, com `skipTrailingSlashRedirect` para não quebrar a troca de protocolo do
  WebSocket).

## Handshake

Em ordem (`events.gateway.ts`):

1. **Limite de tentativas.** 30 handshakes por 60 s por IP real da conexão (chave `ws:handshake:<ip>`,
   incremento e prazo atômicos no Redis). Um handshake autenticado devolve a cota, para que muitos
   aparelhos atrás do mesmo roteador do restaurante não se bloqueiem. Excedeu: evento `error` e
   desconexão.
2. **Equipe pelo cookie `staff_token`.** Conferido no Redis. O socket entra em `staff:<id>`; gerente e
   dono também em `tenant:<slug>`. Sessão marcada para troca de PIN é desconectada.
3. **Chave de serviço.** `x-staff-key` com `x-staff-id` e `x-tenant-slug` (caminho antigo; nenhum app
   atual o usa: o navegador não tem a chave, e as TVs consultam a fila por HTTP em vez de abrir socket).
   Como o funcionário e o papel vêm de cabeçalhos declarados, o caminho é recusado onde o token de sessão
   é obrigatório (produção, staging, preview ou `STAFF_SESSION_REQUIRED=true`).
4. **Mesa.** `x-session-token` (cabeçalho ou `auth.sessionToken`): sessão de mesa; o cliente
   reconhecido pelo cookie é associado ao socket.
5. Sem credencial válida: `error` e desconexão.

## Salas

| Sala                                                             | Quem entra                                                                                      | Como                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tenant:<slug>`                                                  | Gestão (gerente e dono)                                                                         | automático no handshake da equipe e em `join:tenant`                                                           |
| `tenant:<slug>:<papel>` (`kitchen`, `waiter`, `host`, `manager`) | Equipe do papel                                                                                 | `join:tenant {slug, role}`: slug e papel precisam bater com a sessão (`cook` → `kitchen`, `owner` → `manager`) |
| `session:<id da sessão>`                                         | Todos os aparelhos da mesa                                                                      | `join:session`; um socket de mesa só entra na própria sessão                                                   |
| `customer:<id do cliente>`                                       | O cliente identificado (sala privada); gerente ou dono do mesmo restaurante também podem entrar | `join:customer`: o cliente só entra na própria sala; para a equipe, o cliente precisa ser do mesmo restaurante |
| `staff:<id>`                                                     | O próprio funcionário                                                                           | automático no handshake; `join:staff`                                                                          |
| `manager:<id>`                                                   | O próprio gerente                                                                               | `join:manager`                                                                                                 |

## Um socket por app

Cada app abre **um socket compartilhado** e as telas o reutilizam:

- cliente: `apps/web-customer/src/lib/customerSocket.ts`, um socket por (endereço, token da mesa),
  com contagem de uso e desconexão só depois de um tempo ocioso, para que a troca de tela não
  derrube e recrie a conexão;
- equipe: `apps/web-staff/src/lib/staffSocket.ts`, com credenciais (cookie) e o mesmo padrão.

Motivo: todos os clientes de um restaurante saem pelo mesmo IP. Com um socket por tela, um único
cliente gerava dezenas de handshakes e estourava o limite do gateway.

## Eventos principais

Os contratos tipados estão em `packages/shared-types/src/ws-events.ts` (união `WsEvent`).

| Evento                                                                                              | Vai para                                                                                                                    | Quando                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `order:new`, `order:status`                                                                         | cozinha e garçons (`tenant:<slug>:kitchen`, `:waiter`)                                                                      | Pedido confirmado; mudança de estado          |
| `order:created`, `order:status`                                                                     | mesa (`session:<id>`)                                                                                                       | Acompanhamento do pedido pelo cliente         |
| `order:ready`, `order:claimed`                                                                      | garçons                                                                                                                     | Pedido pronto; garçom assumiu a entrega       |
| `order:handoff_called`                                                                              | cozinha, garçons e o garçom escolhido (`staff:<id>`)                                                                        | Cozinha ou bar chamou o garçom para levar     |
| `waiter:call`                                                                                       | garçons (`tenant:<slug>:waiter`)                                                                                            | Chamado novo                                  |
| `waiter:acknowledged`, `waiter:resolved`                                                            | garçons e a mesa (`session:<id>`)                                                                                           | Chamado atendido ou encerrado                 |
| `participant:join_request`, `participant:decision`                                                  | mesa                                                                                                                        | Chegada tardia e decisão do cliente-anfitrião |
| `scan_verification.created`, `.escalated`, `.resolved`                                              | gestão, recepção (`:host`) ou o papel da vez; `.resolved` vai também a `:host`, `:manager` e `:waiter`, à mesa e ao cliente | Verificação do primeiro scan                  |
| `table_merge.created`, `.approved`, `.rejected`; `merge.cooldown_started`, `merge.cooldown_expired` | gestão e as duas mesas                                                                                                      | Junção de mesas                               |
| `complaint.received`, `.responded`, `.resolved`                                                     | gestão; o cliente (`customer:<id>`) na resposta e no encerramento                                                           | Reclamação                                    |
| `courtesy.created`, `.updated`                                                                      | gestão e a mesa                                                                                                             | Cortesia                                      |
| `payment.confirmed`                                                                                 | gestão e a mesa                                                                                                             | Pagamento confirmado                          |
| `zone_pause.started`, `.ended`                                                                      | gestão e o garçom pausado                                                                                                   | Pausa de garçom                               |
| `session.flag_changed`                                                                              | gestão e a mesa                                                                                                             | Marca VIP, alergia ou reincidente             |
| `lgpd.request_fulfilled`                                                                            | gestão e o cliente                                                                                                          | Exclusão de dados concluída                   |
| `alert.created`                                                                                     | `tenant:<slug>:manager`                                                                                                     | Alerta operacional                            |

Alguns eventos emitidos não estão na união tipada: `order:new`, `order:created`, `kitchen:reorder`,
`kitchen:priority_cancel`, `participant:join_request`, `participant:decision`, `bill.split_notified`,
`staff_messages.staff_replied` e `assistant.staff_message_received`.

## Consulta periódica como reforço

O WebSocket não é a única fonte de verdade. Onde perder um evento teria custo, a tela também consulta
por HTTP:

- as TVs (`apps/web-staff/src/components/tv/TvKdsBoard.tsx`) não abrem WebSocket: recarregam
  `GET /:slug/orders/_kds` a cada 5 s;
- a home da recepção (`ScreenHostHome.tsx`) recarrega a cada 8 s, além de ouvir
  `scan_verification.*`;
- a tela de espera do cliente consulta `GET /:slug/table/participants` além de ouvir
  `participant:decision`;
- a home da mesa consulta pausas de garçom a cada 30 s, porque os eventos de pausa não vão para a
  sala da mesa ([Pausa de zona](../produto/funcionalidades/pausa-de-zona.md)).

## Revogação

Quando a sessão de um funcionário é revogada ou um cliente conclui a exclusão LGPD, o gateway
desconecta os sockets dele; a identidade do cliente reconhecido é revalidada no banco a cada
handshake, sem confiar só no cache
([Histórico de chat e LGPD](../produto/funcionalidades/historico-de-chat-e-lgpd.md)).

## Referências de código

- `apps/api/src/modules/websocket/` (gateway, emissor e testes de handshake, autorização e salas)
- `packages/shared-types/src/ws-events.ts`
- `apps/web-customer/src/lib/customerSocket.ts`, `apps/web-staff/src/lib/staffSocket.ts`
