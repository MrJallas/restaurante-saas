# Roteiro E2E: uma noite no restaurante

## Objetivo

Validar uma noite completa de operação no restaurante `restaurant_dev`: do escaneamento do QR físico à
recepção, ao cliente-anfitrião, aos convidados, à cozinha, ao garçom, ao gerente, ao histórico da mesa,
à auditoria e à estabilidade das tarefas periódicas.

O roteiro pode ser seguido à mão ou executado pela suíte automatizada (a partir da raiz do
repositório, com o stack no ar e o seed aplicado; ver [testes](testes.md)):

```bash
cd apps/web-customer
npx playwright test e2e/specs/restaurant-night-simulation.spec.ts
npx playwright test e2e/specs/physical-qr-heavy.spec.ts
```

## Mesas

| Papel no roteiro | Execução manual | Suíte automatizada                       |
| ---------------- | --------------- | ---------------------------------------- |
| Mesa A           | M03             | QRTEST91 (`qrtest91-public-token-fixed`) |
| Mesa B           | M04             | QRTEST92 (`qrtest92-public-token-fixed`) |

- QRTEST91/92 são reservadas aos testes automáticos, que as reiniciam. À mão, use M03 e M04 (ou M05).
  Os tokens de M01–M05 mudam a cada seed; consulte-os como em
  [ambiente local](ambiente-local.md#mesas-e-dados-para-teste-manual).
- O QR de uma mesa é sempre `http://localhost:3001/api/qr/<qr_public_token>`.
- Se `scripts/demo/povoar-salao.sql` foi aplicado, M03 e M04 estão ocupadas: libere com
  `bash scripts/demo/reset-mesa.sh M03` (idem M04) ou use M05.

## Elenco

- Cliente A: primeiro cliente da mesa A; vira o cliente-anfitrião.
- Cliente B: segundo cliente da mesa A; espera a aprovação do anfitrião.
- Cliente C: primeiro cliente da mesa B; passa pela verificação da recepção.
- Recepcionista: aprova ou recusa o primeiro scan de cada mesa.
- Cozinha, garçom e gerente.
- Auditoria: Postgres, MongoDB e logs da API.

Cada pessoa usa um perfil de navegador próprio (o navegador guarda uma sessão de equipe por vez). A
equipe entra por `http://localhost:3002/login` com CPF e PIN do seed (dados fictícios; tabela em
[ambiente local](ambiente-local.md#credenciais-de-teste)). Clientes usam CPFs fictícios com dígito
válido, por exemplo `246.813.579-28`, `135.792.468-28` e `864.209.753-10`.

## Ferramentas

- Navegador com emulação de celular, ou o Playwright para vários contextos ao mesmo tempo.
- Simulador iOS, opcional (ver [testes no iOS](testes-no-ios.md)).
- Postgres: `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas`.
- Logs: `docker logs restaurant-api`.

## Preparação

1. Serviços no ar: `docker ps --format '{{.Names}} {{.Status}}' | sort` deve listar `restaurant-api`,
   `restaurant-ai`, `restaurant-postgres`, `restaurant-mongodb`, `restaurant-redis`,
   `restaurant-web-customer` e `restaurant-web-staff`.
2. Recepção aberta **antes** do primeiro scan: ela tem cerca de 60 segundos para decidir.
3. O fluxo antigo continua bloqueado em `POST /api/restaurant_dev/session/init` (coberto pela suíte):
   sem `accessToken`, token vazio, token de outra mesa ou vencido → `401`; payload completo → `201`.

## Ato 1: a porta do restaurante

**Cena 1 — Cliente A chega à mesa A.** Abrir o QR, conferir o redirecionamento para o app do cliente
com `hmac`, `ts` e `accessToken`, permitir a localização e informar nome e CPF.

Esperado: tela "Esperando aprovação"; `table_sessions` ativa para a mesa;
`session_participants.status = pending`; `scan_verification_requests.status = pending`; nada de
cardápio nem de pedido.

**Cena 2 — A recepção vê a chegada.** Recepcionista logada em `/host`: aparece "Verificar mesa
escaneada" com mesa, cliente, CPF mascarado, localização e tempo restante. Abrir o cartão
(`/host/scan-verification/<id>`) e clicar em "Aprovar entrada".

Esperado: pedido e participante `approved`; `table_sessions.host_customer_id` = cliente A; o cliente A
sai da espera sem escanear de novo e continua dentro depois de recarregar a página.

## Ato 2: o anfitrião assume a mesa

**Cena 3 — Cliente B chega à mesa A.** Escaneia o mesmo QR e informa nome e CPF.

Esperado: cliente B `pending`; nenhum `scan_verification_request` novo; nada chega à equipe; o
anfitrião recebe o pedido de entrada (evento `participant:join_request`).

**Cena 4 — O anfitrião aprova.** No app do cliente A, aprovar o cliente B.

Esperado: B `approved` e dentro do app; A continua anfitrião; B não passou pela recepção.

**Alternativa — o anfitrião recusa.** Repetir com outro cliente e recusar.

Esperado: participante `rejected`, sem acesso a cardápio e pedidos; a equipe não participa. Quem foi
recusado continua barrado até a sessão da mesa fechar; quem desiste sozinho pode pedir de novo.

## Ato 3: outra mesa entra pela recepção

**Cena 5 — Cliente C chega à mesa B.** Escaneia, informa nome, CPF e localização; a recepção aprova.

Esperado: nova sessão ativa na mesa B; C vira o anfitrião dela e entra no app.

**Alternativa — a recepção recusa** com o motivo "mesa vazia".

Esperado: pedido e participante `rejected`; C sem acesso ao cardápio; o MongoDB registra o motivo e os
identificadores de restaurante, mesa, cliente e funcionário.

## Ato 4: o pedido vai para a cozinha

**Cena 6 — As mesas pedem.** Mesa A: 2 unidades de um item; mesa B: 1 unidade de outro. Confirmar e
abrir `/cozinha` (login da cozinha).

Esperado: pedidos em "NOVOS", itens pelo nome, status inicial `received`.

**Cena 7 — A cozinha prepara.** Mover os pedidos para "PREPARANDO" (`in_progress`), recarregar, mover
o da mesa A para `ready` e depois `delivered`; deixar o da mesa B em `ready`.

Esperado: transições `received → in_progress → ready → delivered` aceitas, histórico de status gravado,
nenhum erro 500.

## Ato 5: chamados de garçom

**Cena 8 — Clientes chamam o garçom.** Mesa A pede "Servir bebida" e logo depois "Pedir conta"; mesa
B pede "Outro motivo".

Esperado: a mesa A reaproveita o chamado ativo (mesmo `callId` enquanto estiver pendente ou
reconhecido); a mesa B cria o seu; o garçom (login em `/waiter`) vê os cartões.

**Cena 9 — O garçom atende.** Reconhecer cada chamado com previsão de chegada.

Esperado: status `acknowledged`; o cliente vê o atendimento; nenhuma chamada com `callId` indefinido.

## Ato 6: o gerente entra em cena

**Cena 10.** Gerente logado: `/manager/operacoes/mesas-ativas` mostra "Mesas ativas";
`/manager/mesa/<número>` mostra a mesa A.

Esperado: mesa A ativa; histórico, participantes e pedidos batem com o Postgres.

## Ato 7: incidentes e escalada

**Cena 11 — Ninguém responde à verificação.** Criar uma verificação pendente e aguardar (ou forçar) o
prazo de cada nível.

Esperado: `escalation_chains.level` vai de 0 (recepção) a 1 (gerente) e 2 (garçom), com cerca de
60 s por nível; o cliente continua esperando; no fim, pedido `expired`, participante `rejected` e
cadeia com `completed_at` preenchido.

**Cena 12 — O gerente decide depois da escalada.** Criar pendência, deixar escalar e aprovar como
gerente.

Esperado: pedido e participante `approved`, com `approved_by_staff_id` do gerente. Hoje só a suíte
automatizada faz isso, **pela API**: a tela de verificação só habilita os botões enquanto a
verificação está com a recepção.

## Ato 8: concorrência (suíte automatizada)

**Cena 13 — Dois primeiros scans na mesma mesa**, quase juntos, com CPFs diferentes. Esperado: uma
única sessão ativa; os dois `pending`; sem `color_index` duplicado; aprovar um não aprova o outro.

**Cena 14 — Dois funcionários decidem a mesma pendência.** A aprova e B tenta recusar logo em seguida.
Esperado: a primeira decisão vence; a segunda recebe conflito; nenhum evento final contraditório.

## Ato 9: isolamento e auditoria (suíte automatizada)

**Cena 15 — Restaurante isolado.** A suíte cria o restaurante `restaurant_e2e_other` e tenta usar o
token e os pedidos do restaurante A pelo slug do B. Esperado: o QR público resolve a mesa certa pelo
token global; `/session/init` só opera no restaurante certo; B não lê dados de A; o MongoDB grava o
`tenantId` correto.

**Cena 16 — Eventos de auditoria.** QR resolvido, token inválido, verificação criada, aprovada,
recusada e expirada. Esperado: índices por restaurante e data; eventos com `tenantId`, `tableId`,
`tableSessionId` e `customerId` quando se aplicam.

## Ato 10: fechamento e reuso do QR

**Cena 17.** Cliente entra e vira anfitrião; a equipe fecha a mesa; outro cliente escaneia o mesmo QR.

Esperado: o QR físico é o mesmo; nasce uma sessão nova sem herdar o anfitrião; sem liberação prévia,
nova verificação da recepção; com "Liberar mesa" ativa (15 min), entra direto.

## Checagens técnicas finais

```bash
npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-customer -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json
docker logs restaurant-api --since 2m 2>&1 | grep -E "ERROR|QueryFailedError|ExceptionsHandler" || true
```

Esperado: a noite completa e os testes do QR físico passam (o teste "Mongo fora do ar" para e religa o
container do MongoDB); nenhum `QueryFailedError` recorrente.

## Critérios de falha

- `/session/init` aceita requisição sem `accessToken`.
- Cliente sem liberação prévia entra direto, sem recepção nem anfitrião.
- Segundo cliente de uma mesa com anfitrião gera pendência para a equipe.
- Anfitrião aprovado perde o papel depois de recarregar.
- Pedido muda para status inválido ou recebe erro 500.
- Chamado de garçom usa identificador indefinido em vez de `callId`.
- A equipe consegue trocar uma decisão final já tomada.
- Um restaurante lê dados de outro.
- Tarefas periódicas geram `ERROR` repetido por tabela inexistente.

Depois de rodar a suíte automatizada, veja em [testes](testes.md#efeitos-no-ambiente-e-dados-que-ficam)
o que ela deixa no banco.
