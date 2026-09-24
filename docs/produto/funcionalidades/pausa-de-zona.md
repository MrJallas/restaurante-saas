# Pausa de zona

A pausa de zona alivia **um garçom** sobrecarregado sem parar o restaurante inteiro. O nome ficou
"zona" por herança, mas desde a migration 032 a pausa é **por garçom** (`zone_pauses.waiter_id`), não
por área do salão.

## Quem pausa

Gerente ou dono, em `/manager/pausa-zona` (tela `ScreenManagerOrdersPause`) ou a partir do detalhe de
sobrecarga da equipe. A tela oferece 5, 10, 15 ou 30 minutos. O garçom não pausa a si mesmo.

## API

Todas as rotas ficam sob `/api/:slug/zone-pauses`
(`apps/api/src/modules/zone-pause/zone-pause.controller.ts`):

| Rota                        | Quem pode                            | O que faz                                                                             |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `POST /zone-pauses`         | gerente ou dono                      | Inicia a pausa: `waiterId`, `durationMinutes` (1 a 240; padrão 5) e `reason` opcional |
| `POST /zone-pauses/:id/end` | gerente ou dono                      | Encerra antes do prazo                                                                |
| `DELETE /zone-pauses/:id`   | gerente ou dono                      | O mesmo que `/end`, em estilo REST                                                    |
| `GET /zone-pauses`          | equipe ou cliente com sessão de mesa | Lista pausas (`active`, `waiterId`). Para o cliente, não devolve dados pessoais       |

Regras do serviço (`zone-pause.service.ts`):

- só pausa quem tem papel `waiter` e está ativo; outro papel recebe 400
  (`ZONE_PAUSE_INVALID_WAITER`);
- um garçom tem no máximo uma pausa ativa; uma segunda recebe 400 (`ZONE_PAUSE_ALREADY_ACTIVE`);
- quem iniciou e quem encerrou vêm da sessão autenticada da equipe, nunca do corpo da requisição.

A varredura periódica (`ttl-tick.service.ts`, a cada 10 s) encerra as pausas vencidas e emite
`zone_pause.ended` com `autoExpired: true`. O início emite `zone_pause.started`.

## Efeito real

| Onde                       | O que muda                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrega de pedidos prontos | O garçom em pausa **não** recebe entregas. Os filtros de pausa se repetem em todas as etapas da escolha do garçom (zona, último que atendeu a mesa, turno, qualquer ativo) em `apps/api/src/modules/orders/order-delivery.service.ts` |
| Carga dos garçons          | O painel do gerente marca o garçom como pausado (`waiter-workload.service.ts`)                                                                                                                                                        |
| App do garçom              | Banner em `/waiter` com o tempo restante, ligado e desligado em tempo real pelos eventos (`apps/web-staff/src/screens/waiter/ScreenHomeGrid.tsx`)                                                                                     |
| Recepção                   | A pausa aparece na caixa de entrada passiva (`GET /:slug/host/inbox`)                                                                                                                                                                 |
| App do cliente             | Aviso discreto "Pedidos com tempo de preparo um pouco maior agora" na home da mesa                                                                                                                                                    |

O que a pausa **não** faz:

- não bloqueia pedidos: o cliente continua pedindo e o garçom continua lançando pedido direto;
- não bloqueia pagamento nem chamados;
- não muda o número de ETA mostrado ao cliente: o app só exibe o aviso de texto.

## ETA silencioso no cliente

O desenho previa aumentar a ETA "em silêncio" para as mesas do garçom pausado. O que existe hoje é
mais simples (`apps/web-customer/src/hooks/useZonePause.ts`):

- a home da mesa consulta `GET /:slug/zone-pauses?active=true` a cada 30 s, só depois que o cliente
  entrou (os eventos de pausa vão para as salas da equipe, não para a da mesa);
- o cliente não sabe qual garçom atende a mesa, então o hook usa **a primeira pausa ativa do
  restaurante**. Com qualquer garçom pausado, todas as mesas veem o aviso;
- o aviso é só texto; nenhum cálculo de ETA considera a pausa.

## Limites e divergências

| Tema                      | Situação                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto do banner do garçom | Diz "ZONA PAUSADA · comandas bloqueadas até…", mas nenhum pedido é bloqueado; o efeito real é não receber entregas                                        |
| Aviso ao cliente          | Vale para o restaurante inteiro, não só para as mesas do garçom pausado                                                                                   |
| ETA                       | Não é ajustada pela pausa                                                                                                                                 |
| Nome                      | "Pausa de zona" pausa uma pessoa; o nome na interface não mudou                                                                                           |
| Desenho original          | Previa fila congelada de pedidos, pausa automática por saturação e cancelamento da pausa quando outro garçom assume as mesas. Nada disso foi implementado |

## Referências de código

- `apps/api/src/modules/zone-pause/` (controller, serviço e testes)
- `packages/database/migrations/tenant-template/021_create_zones_and_zone_pauses.sql` e
  `032_zone_pauses_refactor.sql`
- `apps/api/src/modules/orders/order-delivery.service.ts` (`resolveTargetWaiter`)
- `apps/web-staff/src/screens/manager/ScreenManagerOrdersPause.tsx`
- `apps/web-staff/src/screens/waiter/ScreenHomeGrid.tsx`
- `apps/web-customer/src/hooks/useZonePause.ts` e `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`
- Entrega e escolha do garçom: [Ciclo do pedido](../../arquitetura/ciclo-do-pedido.md)
