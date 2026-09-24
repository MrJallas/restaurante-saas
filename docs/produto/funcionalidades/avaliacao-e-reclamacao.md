# Avaliação e reclamação

O cliente avalia cada pedido entregue e pode abrir uma reclamação, que chega ao gerente como um
chamado. A resposta do gerente volta para o app do cliente em tempo real.

## Avaliação do pedido

**Quando nasce.** Quando o pedido vira `delivered` (o garçom confirma a entrega), a API cria uma linha
em `order_ratings` para aquele pedido, ainda sem nota (`OrderRatingsService`, chamado por
`order-delivery.service.ts` e `orders.service.ts`). É uma linha por pedido (`UNIQUE` em `order_id`).

**Convite.** A tarefa `RatingPushService` roda a cada minuto e procura avaliações pendentes criadas
há mais de 13 min para enviar um push. Como não há provedor de push configurado
(`apps/api/src/modules/jobs/push.service.ts` responde `provider_not_configured`), **o convite
automático nunca chega**. A reserva no Redis (`rating-push:<id>`, 30 dias) é liberada quando o envio
falha, então o sistema tenta de novo nos minutos seguintes.

**Como o cliente chega à tela hoje.** Pela rota `/[slug]/orders/[orderId]/rating`, aberta por:

- o chip "Avaliar" das mensagens da home depois do pagamento, quando há um pedido no contexto
  (`services/ai-service/services/continuation.py`); sem pedido no contexto, o chip leva à avaliação
  da visita (`/[slug]/pagamento/feedback`);
- o endereço direto da rota.

**Envio.** `POST /api/:slug/order-ratings` (sessão de mesa obrigatória). O cliente é identificado pelo
cookie `recognition_token`, nunca por um id no corpo, e o pedido precisa ser da mesa da sessão.
Reenviar uma avaliação já feita devolve `alreadyRated: true` em vez de erro. `GET
/api/:slug/order-ratings/:orderId` lê a avaliação, também restrita à mesa.

**Nota baixa vira reclamação** (`order-ratings.service.ts`):

| Nota   | Comentário | Resultado                                                                         |
| ------ | ---------- | --------------------------------------------------------------------------------- |
| 1 ou 2 | preenchido | A reclamação é criada na hora e o app abre o acompanhamento dela                  |
| 1 ou 2 | vazio      | O app abre o formulário de reclamação (`/[slug]/complaints/new`)                  |
| 3      | qualquer   | O app abre o formulário de reclamação, com o comentário (se houver) já preenchido |
| 4 ou 5 | qualquer   | Só grava a nota                                                                   |

**A nota conta para o garçom que entregou.** O indicador de avaliação da equipe
(`apps/api/src/modules/dashboard/dashboard.service.ts`) faz a média das notas dos últimos 7 dias
cruzando cada avaliação com `order_deliveries.claimed_by`, isto é, com o garçom que assumiu a
entrega. Enquanto o convite por push não chega, poucas avaliações existem e o indicador tende a ficar
vazio.

## Reclamação

Rotas sob `/api/:slug/complaints` (`apps/api/src/modules/complaints/complaints.controller.ts`):

| Rota                           | Quem               | O que faz                                                                              |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `POST /complaints`             | cliente com sessão | Abre a reclamação: texto (até 2000 caracteres), tipo e nota opcionais, pedido opcional |
| `GET /complaints/mine`         | cliente com sessão | Lista as reclamações do próprio cliente                                                |
| `GET /complaints/:id`          | cliente com sessão | Acompanha uma reclamação                                                               |
| `GET /complaints`              | equipe             | Lista para o gerente, com filtro por status                                            |
| `POST /complaints/:id/respond` | gerente ou dono    | Responde ao cliente, com um atalho opcional                                            |
| `POST /complaints/:id/forward` | gerente ou dono    | Encaminha para outro membro da equipe                                                  |
| `POST /complaints/:id/resolve` | equipe             | Encerra a reclamação                                                                   |

Tipos de problema aceitos: `demora`, `item-errado`, `item-faltando`, `comida-fria` e `outro`
(migration 033). Atalhos da resposta: `on-the-way`, `kitchen-check`, `courtesy` e `custom`.

Ciclo de estados: `pending_review` → (`in_progress`, se encaminhada) → `responded` → `closed`.

Regras que o código garante:

- o cliente, o pedido e a comanda vêm da sessão autenticada; ids enviados no corpo que não pertencem
  à mesa são ignorados;
- uma reclamação repetida em aberto para o mesmo pedido não é criada de novo (migration 068);
- só um gerente responde: se dois tentam ao mesmo tempo, o segundo recebe "já respondida";
- o encaminhamento cria uma cadeia em `escalation_chains` (tipo `complaint`) e avisa o destinatário.

Telas do cliente: `/[slug]/complaints` (lista), `/[slug]/complaints/new` (nova) e
`/[slug]/complaints/[id]` (acompanhamento).

## O que o gerente vê

- o evento `complaint.received` vai para a sala de gestão do restaurante e atualiza o painel inicial
  do gerente (`/manager`) sem recarregar;
- detalhe em `/manager/chamado/<id>`, onde o gerente responde, encaminha ou encerra; uma cortesia
  pela espera é enviada em `/manager/compensate`;
- a reclamação também aparece na caixa de entrada passiva da recepção e na linha do tempo da sessão.

A resposta fica gravada na própria reclamação (`response_text`) e chega ao cliente pelo evento
`complaint.responded`, na sala privada dele. O encerramento emite `complaint.resolved`.

## Push

Nenhum push sai do sistema hoje: nem o convite de avaliação, nem aviso ao gerente, nem a resposta ao
cliente. Tudo o que é imediato usa o WebSocket e só chega a quem está com o app aberto. Integrar um
provedor (APNs/FCM) é pendência registrada em
[Riscos aceitos e pendências](../../seguranca/riscos-aceitos-e-pendencias.md).

## Desenho original

O desenho visual desta funcionalidade está no canvas:

- cliente: [app-cliente-canvas-v2.html](../../design/canvas/app-cliente-canvas-v2.html);
- gerente: [app-garcom-canvas-v12.html](../../design/canvas/app-garcom-canvas-v12.html).

Diferenças entre o desenho e o código:

| Desenho                                                        | Código atual                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Rotas `/customer/orders/:id/rating` e `/staff/complaints/*`    | `/:slug/order-ratings` e `/:slug/complaints`                                                 |
| Tela `/[slug]/avaliar/[orderId]`                               | `/[slug]/orders/[orderId]/rating`                                                            |
| Push 3 a 5 min após a entrega, com som próprio                 | Tarefa de 13 min sem provedor de push; nada é entregue                                       |
| Resposta do gerente gravada como mensagem do assistente        | Resposta gravada na própria reclamação                                                       |
| Evento `complaint.created` e confirmação de leitura automática | Evento `complaint.received`; o emissor de `complaint.read` existe, mas nenhum código o chama |

## Referências de código

- `apps/api/src/modules/order-ratings/`, `apps/api/src/modules/complaints/`
- `apps/api/src/modules/jobs/rating-push.service.ts` e `push.service.ts`
- `apps/web-customer/src/app/[slug]/orders/[orderId]/rating/page.tsx`
- `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerOrderRating.tsx`
- Migrations `026_create_complaints_and_order_ratings.sql`, `033_complaints_problem_type.sql` e
  `068_complaints_dedup_unique.sql`
