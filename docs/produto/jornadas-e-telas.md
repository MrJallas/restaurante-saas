# Jornadas e telas

Mapa das rotas dos dois apps web por persona. Os caminhos são das pastas `src/app/` de cada app
(Next.js App Router). O controle de acesso que vale é o da API: as verificações de papel nas telas
são conveniência.

## Como a equipe entra

App da equipe (`apps/web-staff`, porta 3002):

1. `/` redireciona para `/login`.
2. `/login`: CPF e PIN. O restaurante vem de `NEXT_PUBLIC_TENANT_SLUG` (no ambiente local,
   `restaurant_dev`).
3. Depois do login, cada papel vai para a sua tela (`homeForStaffRole` em
   `apps/web-staff/src/lib/api.ts`):

| Papel                                | Tela inicial          |
| ------------------------------------ | --------------------- |
| Dono (`owner`) e gerente (`manager`) | `/manager`            |
| Recepção (`host`)                    | `/host`               |
| Garçom (`waiter`)                    | `/waiter`             |
| Cozinha (`cook`)                     | `/cozinha`            |
| Bar (`bartender`)                    | `/bar`                |
| Caixa (`cashier`)                    | `/cashier`            |
| Papel desconhecido                   | `/dashboard` (legado) |

PIN temporário leva primeiro a `/trocar-pin`. Recuperação de PIN: `/forgot`, `/forgot/verify` e
`/forgot/reset`.

O dono vê tudo o que o gerente vê. A única tela exclusiva do dono é `/manager/estabelecimento`.

## Cliente

App do cliente (`apps/web-customer`, porta 3003). São **31** telas sob `/[slug]/…` (32 no app,
contando `/`, que é só um marcador: o cliente sempre entra pelo QR).

| Grupo                  | Rotas                                                                                                                                                            | O que é                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Entrada                | `/[slug]/mesa/[tableCode]`                                                                                                                                       | Destino do QR: abre a sessão, pede localização, identifica (nome e CPF), mostra a espera de aprovação e depois a home da mesa |
|                        | `/[slug]`                                                                                                                                                        | Home para quem já tem sessão                                                                                                  |
|                        | `/[slug]/identify`                                                                                                                                               | Pede o CPF para abrir uma tela pessoal a quem já está sentado. Não é entrada de mesa                                          |
| Cardápio e pedido      | `/[slug]/cardapio`, `/[slug]/cardapio/[itemId]`                                                                                                                  | Cardápio e detalhe do item, com a escolha entre comanda da mesa e comanda individual                                          |
|                        | `/[slug]/pedido`, `/[slug]/pedido/revisar`, `/[slug]/pedido/confirmando`, `/[slug]/pedido/enviado`, `/[slug]/pedido/mesa`                                        | Meu pedido, revisão do carrinho, janela de 15 s para desistir, envio concluído e os pedidos da mesa inteira                   |
| Conta                  | `/[slug]/pagamento` (e o sinônimo `/[slug]/conta`), `/[slug]/pagamento/dividir`, `/[slug]/pagamento/pix`, `/[slug]/pagamento/erro`, `/[slug]/pagamento/feedback` | Conta, divisão, Pix de demonstração, erro e avaliação da visita                                                               |
| Assistente             | `/[slug]/assistente`                                                                                                                                             | Assistente de IA: botões "Chamar garçom" e "Ver cardápio" e, depois da primeira mensagem, a conversa                          |
| Garçom                 | `/[slug]/garcom/chamando`                                                                                                                                        | Acompanhamento de um chamado de garçom, com cancelar. O chamado em si abre como painel deslizante em qualquer tela            |
| Avaliação e reclamação | `/[slug]/orders/[orderId]/rating`, `/[slug]/complaints`, `/[slug]/complaints/new`, `/[slug]/complaints/[id]`                                                     | Avaliação de um pedido e reclamações                                                                                          |
| Pessoal                | `/[slug]/eu`, `/[slug]/chat-history`, `/[slug]/chat-history/[threadId]`, `/[slug]/staff-messages`, `/[slug]/staff-messages/[threadId]`, `/[slug]/cortesias`      | Perfil e privacidade, histórico do assistente, mensagens com a equipe, cortesias recebidas                                    |
| Cliente-anfitrião      | `/[slug]/host/approve/participant`, `/[slug]/host/approve/merge`                                                                                                 | Aprovar quem quer entrar na mesa; aprovar junção de mesas                                                                     |
|                        | `/[slug]/waiting-approval`                                                                                                                                       | Espera da decisão de junção de mesas. A espera de quem chega tarde é mostrada dentro de `/[slug]/mesa/[tableCode]`            |

Regras de entrada: [Cliente-anfitrião e mesa compartilhada](funcionalidades/cliente-host-e-mesa-compartilhada.md).

## Recepção: `/host/*`

| Rota                                                                                                        | O que é                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/host`                                                                                                     | Home: contadores de mesas, mesas livres e a seção "Verificar mesa escaneada" com os primeiros scans pendentes. Atualiza por evento e a cada 8 s |
| `/host/scan-verification/[id]`                                                                              | Detalhe de um primeiro scan, com "Aprovar entrada" e "Rejeitar"                                                                                 |
| `/host/liberate/[tableId]`                                                                                  | Liberar a mesa para o próximo grupo: o primeiro scan em até 15 min entra direto                                                                 |
| `/host/tables/[status]`                                                                                     | Mesas filtradas por estado                                                                                                                      |
| `/host/swap`                                                                                                | Mover uma sessão para outra mesa                                                                                                                |
| `/host/waitlist`, `/host/waitlist/[id]`                                                                     | Fila de espera                                                                                                                                  |
| `/host/reservations`, `/host/reservations/[id]`                                                             | Reservas                                                                                                                                        |
| `/host/notifications`                                                                                       | Caixa de entrada passiva (pedidos de ajuda de mesa, junções decididas, reclamações, pausas)                                                     |
| `/host/mensagens`, `/host/mensagens/[threadId]`                                                             | Mensagens internas da equipe                                                                                                                    |
| `/host/profile`, `/host/seguranca`, `/host/aparencia`, `/host/notificacoes-prefs`, `/host/turnos-historico` | Perfil e saída, PIN e sessão, tema, preferências de aviso, histórico de turnos                                                                  |

A recepção só aprova o primeiro scan enquanto o pedido está no nível dela (60 s). Depois ele sobe para
o gerente e o garçom, que recebem o evento mas não têm tela de aprovação no app `[NÃO VERIFICADO em
uso]`.

## Garçom: `/waiter/*`

| Rota                                                                                       | O que é                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `/waiter`                                                                                  | Grade de mesas, faixa de chamados ativos e aviso de pausa                  |
| `/waiter/chamados`, `/waiter/call/[id]`                                                    | Chamados (mesa, mensagens do gerente, pedidos prontos) e detalhe           |
| `/waiter/table/[id]`                                                                       | Detalhe de uma mesa                                                        |
| `/waiter/entrega/[orderId]`                                                                | Entrega: "Estou levando" e "Confirmar entrega"                             |
| `/waiter/scan-qr`, `/waiter/scan-qr/picker`, `/waiter/scan-qr/delivery-confirm`            | Ler o QR da mesa com a câmera, escolher a mesa à mão e confirmar a entrega |
| `/waiter/new-entry`, `/waiter/order-direct`                                                | Nova visita ou pedido lançado pelo garçom                                  |
| `/waiter/qr-issue`                                                                         | Relatar QR ilegível                                                        |
| `/waiter/notifications`, `/waiter/mensagens`, `/waiter/mensagens/[threadId]`, `/waiter/eu` | Avisos, mensagens e perfil                                                 |

## Cozinha

| Rota                                                  | O que é                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `/cozinha`                                            | KDS individual da cozinha, com login                            |
| `/cozinha/eu`                                         | Perfil e o tempo base de preparo usado na estimativa do cliente |
| `/cozinha/mensagens`, `/cozinha/mensagens/[threadId]` | Mensagens internas                                              |
| `/cozinha/unlock`                                     | Tela de PIN que destrava as TVs                                 |
| `/cozinha/tv`                                         | TV da cozinha, sem login e protegida pelo PIN de TV             |

## Bar

| Rota      | O que é                                              |
| --------- | ---------------------------------------------------- |
| `/bar`    | KDS individual do bar, com login (papel `bartender`) |
| `/bar/tv` | TV do bar, protegida pelo PIN de TV                  |

O seed de demonstração não cria usuário de bar; a TV do bar funciona sem login.

## Gerente e dono: `/manager/*`

| Grupo             | Rotas                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painel e operação | `/manager`, `/manager/operacoes` e os recortes `/mesas-ativas`, `/atencao`, `/em-alerta`, `/criticos`; `/manager/alertas`                               |
| Mesa              | `/manager/mesa/[n]`, `/manager/table-menu/[tableId]` (pessoas, observação, VIP), `/manager/session-timeline/[sessionId]`, `/manager/timeline/[orderId]` |
| Detalhes          | `/manager/stat/[kind]/[id]`, `/manager/chamado/[id]` (chamado, reclamação, QR ilegível)                                                                 |
| Equipe            | `/manager/equipe`, `/novo`, `/[id]`, `/[id]/editar`, `/turnos`, `/em-campo`, `/carga-media`, `/sobrecarga`; `/manager/turnos-historico`                 |
| Fluxo             | `/manager/pausa-zona` (pausa de garçom), `/manager/kitchen-reorder` (puxar pedido na fila)                                                              |
| Clientes          | `/manager/cortesias`, `/manager/compensate` (enviar cortesia), `/manager/mensagens`, `/nova`, `/[threadId]`, `/cliente/[threadId]`                      |
| Financeiro        | `/manager/financeiro`, `/manager/financeiro/detalhe/[kind]` (só leitura)                                                                                |
| Conta             | `/manager/configuracoes`, `/manager/seguranca`, `/manager/aparencia`, `/manager/notifications`, `/manager/notificacoes-prefs`                           |
| Só o dono         | `/manager/estabelecimento`: dados do estabelecimento, horários e cerca geográfica                                                                       |

## Caixa

`/cashier` mostra só "Caixa ainda não ativado" e só abre para o papel `cashier`. Não há liquidação
presencial ([Pagamento e Pix](funcionalidades/pagamento-pix.md)).

## Legado

| Rota                                                            | Situação                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/dashboard`, `/dashboard/funcionarios`, `/dashboard/promocoes` | Painel antigo, anterior a `/manager`. É o destino de papel desconhecido e só abre para gerente e dono |
| `/garcom/pedidos`                                               | Só redireciona para `/waiter`                                                                         |
