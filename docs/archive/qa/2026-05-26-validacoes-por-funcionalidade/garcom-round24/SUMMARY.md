# Round 24 - Garcom QA

Data: 2026-05-26

Ambiente local:
- API: `http://localhost:3001`
- Web staff: `http://localhost:3002`
- Tenant/schema: `restaurant_dev`

## Validacoes executadas

- `git diff --check`
- `npm exec --workspace @restaurant/api -- tsc --noEmit`
- `npm exec --workspace @restaurant/web-staff -- tsc --noEmit`
- `npm run build --workspace @restaurant/api`
- `npm run build --workspace @restaurant/web-staff`

Todas passaram.

## Browser QA

- `/waiter/new-entry?tenant=restaurant_dev`: modal "Como vai comecar?" exibiu apenas `Cliente nova visita` e `Pedido direto`; `Reservar` nao apareceu.
- `/waiter/notifications?tenant=restaurant_dev`: bottom nav permaneceu `Mesas / Chamados / Novo / Turno / Eu`; nao vazou `manager-only endpoint`.
- `/waiter/chamados?tenant=restaurant_dev`: botao central `Novo` abriu `/waiter/new-entry`.
- `/waiter/order-direct?tenant=restaurant_dev&table=M01&tableNumber=1`: abriu lancamento de pedido, nao a tela de entrega.
- Pedido direto: item `Picanha na Brasa` abriu revisao com timer de 15s, `Editar` e `Enviar agora`.
- Envio do pedido direto: voltou para `/waiter/table/M01?...&newOrder=dbd9fbec-f5b5-461a-9310-16eff538ca89`, total `R$ 78,90`, item pendente na mesa.

## Encerrar turno

Foi aplicada localmente a migration `052_staff_shift_end_requests.sql` no schema `restaurant_dev`, pois a tabela ainda nao existia no banco Docker.

Casos validados:

- Ana Garcom (`320de62c-073f-4e50-9f68-f5e9064c8bab`) clicou `Encerrar turno` e foi para o thread `b029727b-1c3e-4fae-b1bb-0871053d6fc8` sem logout, com o texto "Gerente esta analisando seu pedido".
- Erica Gerente (`8bd06156-1fe5-4c18-a82d-43d38287ed4a`) viu `Aceitar`/`Recusar` no chat e aprovou o request `ee3b9aea-1233-4a13-98fc-1ebb052a988a`.
- Bruno Garcom (`35c95cc6-312a-4cfb-b857-8fe77a7dd5d3`) teve request `24e54c96-d985-4c4e-a606-998c49a2be96` recusado pelo gerente.
- Garcom Demo (`e82a5258-1006-4e11-bbed-c4f79e1da225`) ficou com o chat aberto no thread `877261eb-4cb2-435d-a778-52b06b749e57`; a decisao foi enviada via API para simular o gerente em paralelo e a mensagem de aprovacao apareceu no chat do garcom sem reload.
- Reabertura do thread decidido do gerente confirmou que a resposta `Encerramento aprovado` aparece sem renderizar novamente os botoes `Aceitar`/`Recusar`.

Estado final no banco:

- `62e8371c-61a1-4bab-a7b4-b0f8d3f86051`: Garcom Demo, `approved`, resposta `QA aprovado sem refresh`.
- `24e54c96-d985-4c4e-a606-998c49a2be96`: Bruno Garcom, `rejected`.
- `ee3b9aea-1233-4a13-98fc-1ebb052a988a`: Ana Garcom, `approved`.

## Evidencias

- `01-new-entry.png`
- `02-waiter-notifications.png`
- `03-chamados-novo-click.png`
- `04-order-direct.png`
- `05-order-direct-review.png`
- `06-order-direct-after-send.png`
- `09-waiter-shift-thread.png`
- `10-manager-shift-decision.png`
- `13-waiter-approved-no-reload.png`
- `14-manager-after-decision-no-buttons.png` tentou captura, mas o browser local estourou timeout; a validacao DOM confirmou `hasApproved=true`, `hasAccept=false`, `hasReject=false`.
