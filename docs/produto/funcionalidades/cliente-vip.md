# Cliente VIP

A marcação VIP dá prioridade a uma mesa durante a visita: os pedidos dela sobem na fila da cozinha e
do bar e a mesa ganha destaque nas telas da equipe. O cliente não vê a marcação.

## Escopo: a sessão da mesa

VIP é uma **marca da sessão**, não do cliente. Vale enquanto a sessão da mesa estiver aberta; a
próxima sessão da mesma mesa começa sem marcas.

A mesma estrutura guarda três marcas: `vip`, `allergy` (alergia na mesa) e `reincidente`. Cada marca
fica em dois lugares:

| Onde                                    | Para quê                                                        | Migration |
| --------------------------------------- | --------------------------------------------------------------- | --------- |
| `session_flags` (uma linha por marca)   | Auditoria: quem marcou, quando, motivo, quem desmarcou e quando | 028       |
| `table_sessions.flags` (lista de texto) | Leitura rápida nas consultas de fila, mapa e prioridade         | 031       |

`apps/api/src/modules/vip/vip.service.ts` escreve nos dois na mesma operação.

## Quem marca

| Caminho                                                                                                   | Quem o backend aceita                                                        | Quem usa hoje                                                                        |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/:slug/staff/sessions/:tableSessionId/flags` (`flag`, `action: add\|remove`, `reason` opcional) | Gerente ou dono (`StaffOnlyGuard` + `ManagerOnlyGuard`, `vip.controller.ts`) | Menu da mesa do gerente, `/manager/table-menu/<mesa>` (`ScreenManagerTableMenu.tsx`) |
| `GET /api/:slug/staff/sessions/:tableSessionId/flags`                                                     | Qualquer membro da equipe autenticado                                        | Telas da equipe                                                                      |
| `POST /api/:slug/host/tables/:tableNumber/vip`                                                            | Recepção, gerente ou dono (`HostOrManagerGuard`)                             | Nenhuma tela chama esta rota                                                         |

Quem marcou vem sempre da sessão autenticada da equipe; ids enviados no corpo são ignorados. O
garçom não marca VIP: só vê o destaque.

## Prioridade

**Fila da cozinha e do bar (KDS).** `apps/api/src/modules/orders/kds-query.service.ts` ordena os
pedidos em três faixas e, dentro de cada faixa, por ordem de chegada:

1. **urgência**: pedido que o gerente puxou para a frente (`orders.priority_rank > 0`);
2. **VIP**: sessão marcada `vip` **ou** cliente com `customers.is_vip`;
3. **normal**.

A mesma ordem vale para a estimativa de tempo mostrada ao cliente (`eta-decorator.service.ts`): um
pedido VIP entra na fila antes dos normais. As TVs mostram o selo VIP no cartão do pedido
(`apps/web-staff/src/components/tv/KdsOrderCard.tsx`).

**Chamados de garçom.** `apps/api/src/modules/vip/priority.util.ts` define uma regra (alergia e VIP
sempre em prioridade alta; depois tempo de espera e tipo do chamado), mas nenhum código de produção
a chama hoje. A lista de chamados do garçom (`GET /api/:slug/waiter-calls/pending`) devolve as marcas
da sessão; a ordenação por VIP não é aplicada no servidor.

## Tempo real

Cada mudança emite `session.flag_changed` para a sala de gestão do restaurante e para a sala da
sessão, e fica registrada na linha do tempo da sessão. O app do cliente não usa esse evento.

## `customers.is_vip` (legado)

Existe também uma marca **permanente** no cadastro do cliente, `customers.is_vip` (migration 020). A
migration 031 a declarou obsoleta em comentário do schema, mas a coluna continua valendo na
prioridade do KDS (item 2 acima). Rotas: `POST` e `DELETE /api/:slug/customer/:customerId/vip`, só
gerente ou dono. O app da equipe tem o cliente HTTP para essas rotas, mas nenhuma tela o usa.

## Pendências conhecidas

- O evento `session.flag_changed` sai com `tableNumber: 0` e nome de quem marcou vazio
  (`vip.service.ts`, marcado como pendente no próprio código). As telas buscam os dados de novo por
  HTTP ao receber o evento.
- A regra de prioridade de chamados (`priority.util.ts`) está escrita e não é usada.
- Não há decisão de produto sobre mostrar a marcação ao cliente.

## Divergências com registros antigos

| Registro                              | O que dizia                                                                     | O que o código faz                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Desenho original desta funcionalidade | Gerente **e recepção** marcam pelo menu da mesa                                 | A tela da recepção não tem essa ação. O backend aceita a recepção só pela rota `/host/tables/:n/vip`, que nenhuma tela usa     |
| Desenho original                      | Auditoria em `session_audit_logs`                                               | Auditoria em `session_flags`                                                                                                   |
| Desenho original                      | `customers.is_vip` fora do escopo                                               | A coluna existe e entra na prioridade do KDS                                                                                   |
| Notas de trabalho anteriores          | Uma dizia que a recepção não deve ver VIP; outra, que recepção e gerente marcam | O mapa da recepção mostra quais mesas são VIP (`host.service.ts`, campo `has_vip`); marcar é, na prática, do gerente e do dono |

Qual das versões vale como regra de produto está em aberto; esta página descreve o código.

## Referências de código

- `apps/api/src/modules/vip/` (controller, serviço e `priority.util.ts`)
- `apps/api/src/modules/host/host.controller.ts` e `host.service.ts` (`toggleVip`)
- `apps/api/src/modules/customers/customers.controller.ts` (`markVip`, `unmarkVip`)
- `apps/api/src/modules/orders/kds-query.service.ts` e `eta-decorator.service.ts`
- `packages/database/migrations/tenant-template/020_add_customers_is_vip.sql`,
  `028_create_session_flags.sql` e `031_table_sessions_flags.sql`
- Fila por estação: [Ciclo do pedido](../../arquitetura/ciclo-do-pedido.md)
