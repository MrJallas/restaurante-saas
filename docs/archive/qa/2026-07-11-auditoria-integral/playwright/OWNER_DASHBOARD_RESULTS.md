# Dashboard do dono — validação Playwright CLI

Data: 2026-07-11, aproximadamente 03:11–03:16 BRT  
Aplicação: `http://127.0.0.1:3002`  
Tenant efetivo: `restaurant_dev`

## Sessões isoladas

- `owner-a-0711`: login próprio do dono, CPF `90000000000`.
- `owner-b-0711`: segundo login real do mesmo dono, com outro cookie/token.
- `manager-0711`: login próprio do gerente, CPF `90000000001`.

Nenhum PIN foi alterado.

## Resultado

1. Login do dono retornou 200 e abriu `/manager`. O painel mostrou `Dona Demo`,
   todas as abas operacionais e o menu exclusivo
   `Estabelecimento · só donos`.
2. A tela `/manager/estabelecimento?slug=restaurant_dev` fez GET 200 e exibiu
   os valores persistidos: `Meu Restaurante`, `America/Sao_Paulo`, `BRL`, taxa
   10, geofence desligado e horários ainda não cadastrados.
3. Clicar em `Salvar configurações` sem editar mostrou
   `Nenhuma alteração para salvar.`. A lista de requests permaneceu somente
   com os GETs #79/#80; nenhum PATCH foi enviado.
4. Concorrência otimista entre dois dispositivos:
   - A, request #83: PATCH 200 com
     `{"expectedUpdatedAt":"2026-07-11T05:27:19.612Z","restaurantName":"Meu Restaurante · Dispositivo A"}`.
   - B, request #27: PATCH com a mesma versão inicial e
     `serviceFeePercent: 11`; resposta 409, `code: SETTINGS_STALE`.
   - B fez automaticamente o GET #28, recarregou o nome salvo por A e voltou
     a mostrar taxa 10. A UI exibiu: `Outra aba alterou os dados. Recarregamos
     a versão atual; revise antes de salvar.`
5. Recuperação/restauração:
   - B salvou `Meu Restaurante` com a nova versão no PATCH #29 (200).
   - Reload posterior GET #55 confirmou `restaurantName: Meu Restaurante`,
     `serviceFeePercent: 10` e `openingHours: null`.
6. Manager:
   - o menu de conta não contém `Estabelecimento`;
   - URL direta mostra `Configuração exclusiva do dono`;
   - GET #25 e PATCH #26 para `settings/establishment` retornaram 403
     `AUTH_FORBIDDEN`. O PATCH tentou o nome `NUNCA APLICAR`; o GET final do
     dono confirmou que nada foi aplicado.
7. Socket.IO same-origin:
   - o navegador usou `ws://127.0.0.1:3002/socket.io/?EIO=4&transport=websocket`,
     sem caminho duplicado;
   - handshake de polling em
     `/socket.io/?EIO=4&transport=polling&t=owner-audit-0711` retornou HTTP 200,
     `sid` e `upgrades:["websocket"]`;
   - logs do `restaurant-api` registraram os joins reais dos dois dispositivos
     do dono às 06:11:22Z e 06:12:32Z nas rooms tenant, staff e manager; o
     gerente também entrou nas três rooms às 06:14:16Z.
   - houve um warning transitório de `WebSocket is closed before the connection
     is established` quando a primeira sessão navegou entre rotas. O reconnect
     seguinte completou e foi confirmado pelos joins acima; não houve erro de
     trailing slash nem 404 no endpoint Socket.IO.

## Artefatos principais

- `owner-dashboard.png`
- `owner-menu-exclusive.png`
- `owner-settings-initial.png`
- `owner-noop-no-patch.png`
- `owner-device-a-save-200.png`
- `owner-device-b-conflict-409-reloaded.png`
- `owner-demo-restored.png`
- `owner-final-reload-restored.png`
- `manager-menu-without-owner-settings.png`
- `manager-direct-route-blocked.png`
- `owner-device-a.{trace,network}`
- `owner-device-b.{trace,network}`
- `manager-boundary.{trace,network}`

Os arquivos `.network` preservam os request/response bodies e status descritos
acima. Os valores demo foram restaurados antes do encerramento.
