# restauranteSaaS Project Memory

Atualizado em 2026-06-09 por auditoria multiagente Codex.

Use este arquivo como mapa rapido do produto, das fontes de verdade e da
matriz de testes. Ele nao substitui o codigo, o canvas nem os superprompts.

## Ordem Das Fontes

1. `qa-reports/SUPER-PROMPT-CONTINUACAO.md` e `qa-reports/SUPER-PROMPT-V5.md`
   explicam como o app deve funcionar e como retomar trabalho. Leia antes de
   comparar tela atual contra canvas.
2. Canvas final em `docs/design-canvas-final/` e handoff JSX sao a fonte visual
   e de comportamento esperado por persona.
3. Codigo atual em `apps/api`, `apps/web-customer`, `apps/web-staff` e
   `services/ai-service` vence relatorios antigos quando houver divergencia.
4. `qa-reports/audit-r23/**` e superscans sao evidencias historicas. Use para
   pistas, mas revalide no codigo atual porque varios reports ja ficaram
   defasados.
5. `qa-reports/SUPER-PROMPT-V2.md` e o protocolo de bug-hunt text-only valem
   para rodadas de seguranca/contratos sem comparacao visual.

## Stack E Ambiente

- API NestJS: `apps/api`, porta `3001`, prefixo `/api`.
- Customer Next.js: `apps/web-customer`, porta `3003`.
- Staff/KDS Next.js: `apps/web-staff`, porta `3002`.
- AI service FastAPI: `services/ai-service`, porta interna `8000`.
- Postgres multi-schema: DB `restaurant_saas`, tenant default
  `restaurant_dev`, porta interna `5434`.
- Redis: sessoes, rate-limit e filas auxiliares.
- Mongo: historico de chat e auditoria/security logs.
- Staff key dev: `dev-staff-api-key-change-in-prod`.

Sempre confirme os bind mounts dos containers antes de validar visualmente:

```bash
docker inspect restaurant-web-customer --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker inspect restaurant-web-staff --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker inspect restaurant-api --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

Nesta auditoria, os containers estavam montando outro worktree. Foram recriados
pelo repo base com:

```bash
docker compose up -d --force-recreate api web-customer web-staff
```

## Superprompts

- `SUPER-PROMPT-CONTINUACAO.md`: source-of-truth inicial para canvas-vs-impl,
  stack, seed IDs, schema cheat-sheet, features e todas as telas a estudar.
- `SUPER-PROMPT-V2.md`: modo bug-hunt text-only, anti-patterns e protocolo de
  severidade P0/P1/P2/P3.
- `SUPER-PROMPT-V3.md`: estado pos Round 18, ondas de staff/manager/waiter,
  sticky footer fix e backlog backend.
- `SUPER-PROMPT-V4.md`: pos Round 19, continuation rewrite, customer events como
  P0 e canvas gaps.
- `SUPER-PROMPT-V5.md`: Round 20+ retake. Prioridades: customer events,
  performance/chamados/Financeiro, CallWaiterSheet iOS, join-table typewriter,
  StaffBubble history, CourtesyArrival, home chips dinamicos e merge typewriter.

## Personas E Superficies

### Cliente

Fluxo esperado:

- QR fisico com HMAC/ts/accessToken, geolocalizacao, `session/init`, token de
  mesa, reconhecimento ou welcome.
- Home da mesa com continuation/chips vindos do backend.
- Assistente IA com chips contextuais, ferramentas locais e indicadores de tool.
- Cardapio, detalhe de item, draft, revisao, confirmacao em ate 15s e status.
- Pagamento individual/mesa, divisao, Pix, erro e feedback.
- Chamar garcom, mensagens staff, historico de chat, LGPD, rating, reclamacao,
  cortesia e fluxo de mesa compartilhada/late-arrival.

Rotas principais:

- `/`, `/:slug`, `/:slug/mesa/:tableCode`
- `/:slug/assistente`, `/:slug/cardapio`, `/:slug/cardapio/:itemId`
- `/:slug/pedido`, `/:slug/pedido/revisar`, `/:slug/pedido/confirmando`,
  `/:slug/pedido/enviado`, `/:slug/pedido/mesa`
- `/:slug/pagamento`, `/:slug/pagamento/dividir`, `/:slug/pagamento/pix`,
  `/:slug/pagamento/erro`, `/:slug/pagamento/feedback`
- `/:slug/identify`, `/:slug/waiting-approval`,
  `/:slug/host/approve/{participant,join,merge}`
- `/:slug/complaints`, `/:slug/complaints/new`, `/:slug/complaints/:id`,
  `/:slug/chat-history`, `/:slug/staff-messages`, `/:slug/eu`, `/:slug/conta`

Anchors/testids existentes:

- `welcome-modal`, `welcome-submit`, `identify-before-join`,
  `waiting-approval`, `host-join-request-banner`,
  `host-approve-participant`, `reclaim-banner`, `assistente-history-loading`,
  `assistente-landing`, `call-waiter-sheet`, `call-waiter-confirm`,
  `menu-overlay`, `tool-indicator-${toolName}`.

### Staff, Host, Manager E Cozinha

Host/recepcao:

- `/host`, `/host/tables/:status`, `/host/waitlist`, `/host/waitlist/:id`,
  `/host/reservations`, `/host/reservations/:id`, `/host/liberate/:tableId`,
  `/host/swap`, `/host/late-arrival/:id`, `/host/scan-verification/:id`,
  `/host/notifications`, `/host/mensagens`, `/host/profile`,
  `/host/turnos-historico`, `/host/notificacoes-prefs`, `/host/seguranca`,
  `/host/aparencia`.

Garcom:

- `/waiter`, `/waiter/chamados`, `/waiter/call/:id`, `/waiter/new-entry`,
  `/waiter/scan-qr`, `/waiter/scan-qr/picker`,
  `/waiter/scan-qr/delivery-confirm`, `/waiter/table/:id`,
  `/waiter/order-direct`, `/waiter/qr-issue`, `/waiter/mensagens`,
  `/waiter/mensagens/:threadId`, `/waiter/eu`, `/waiter/notifications`.

Manager:

- `/manager`, `/manager/operacoes`,
  `/manager/operacoes/{criticos,atencao,mesas-ativas,em-alerta}`,
  `/manager/mesa/:n`, `/manager/table-menu/:tableId`,
  `/manager/timeline/:orderId`, `/manager/stat/:kind/:id`,
  `/manager/alertas`, `/manager/notifications`, `/manager/equipe/*`,
  `/manager/pausa-zona`, `/manager/kitchen-reorder`, `/manager/cortesias`,
  `/manager/compensate`, `/manager/mensagens/*`, `/manager/financeiro`,
  `/manager/configuracoes`, `/manager/chamado/:id`.

Cozinha/KDS:

- `/cozinha`, `/cozinha/eu`, `/cozinha/mensagens`,
  `/cozinha/mensagens/:threadId`.
- TV KDS adicionada em 2026-06-09/10:
  `/cozinha/tv`, `/bar/tv`, `/cozinha/unlock`, `/api/tv-unlock` e
  `/api/proxy/:path*`. O board usa `GET /:slug/orders/_kds?station=kitchen|bar`
  e, quando pedido fica `ready`, chama `POST /:slug/orders/:orderId/call-waiter`
  em vez de marcar como `delivered`.
- Regras do fluxo de entrega consolidadas pós code-review (2026-06-10):
  qualquer staff ativo pode CONFIRMAR `Entregue` (takeover — `claimed_by`
  registra quem confirmou; bloquear o colega criava pedido preso em
  in_transit); `call-waiter` sem `x-staff-id` = chamada de estação
  (`called_by` NULL), com header presente valida 401; predicados de
  audiência de entrega vivem em `lib/api/waiter` (`isDeliveryForWaiter`/
  `isDeliveryClaimedBy`) — não reimplementar; `useWaiterEvents` usa socket
  COMPARTILHADO por (tenant|staffId) com retry pós-rejeição (gateway
  rate-limita handshakes por IP do restaurante); turnos overnight casam
  assignment de ontem no trecho pós-meia-noite.
- ETA do cliente é DINÂMICA (2026-06-10): `GET /:slug/orders[/:id]`
  devolve eta_minutes_min/max + queue_ahead — fila à frente na ordenação
  canônica (urgência>VIP>normal ÷ ETA_KITCHEN_PARALLEL_LINES) + range por
  estágio que encolhe (10–16 → 5–9 → 2–5 → 1–3). Nunca hardcodar tempo no
  front. Constantes em orders.service (TODO: settings por restaurante).
- Fluxo validado também em iOS real (simulador iPhone 16, xcodebuildmcp +
  idb): Safari → QR → geofence (2 prompts de localização + retry) →
  welcome digitado → pedido → tracker atualizando via WS sem reload.
  Evidências: `qa-reports/tv-delivery-e2e/sim-ios/`.
- Backlog de cleanup aceito (code-review, sem bug): consolidar
  relativeTime/playBeep/psql()/labels de status duplicados; extrair
  TableMap compartilhado (planta); unificar cânon de prioridade com
  priority.util (alergia vs vip); sweep de entregas órfãs no
  TtlTickService; e2e não mutar pedidos alheios do DB dev.
- Fluxo de entrega TV→garçom→cliente validado ponta a ponta em 2026-06-10
  (spec `tv-delivery-flow.spec.ts`, evidencia `qa-reports/tv-delivery-e2e/`):
  banner in-app via WS `order:handoff_called` + poll em todas as rotas
  `/waiter/*` (layout monta `WaiterDeliveryAlerts`), tela
  `/waiter/entrega/[orderId]` com zona (`zones`) + mapa por zona e mesa-alvo
  destacada, `Estou levando` (in_transit) → `Confirmar entrega` (delivered);
  cliente so muda pra `Entregue` depois disso (WS pra sala da sessao, sem
  reload). Feed canonico do garcom: `GET /:slug/deliveries/pending`
  (pending+claimed, com zone_name/itens/target). `call-waiter` da TV nao
  exige `x-staff-id` (estacao; `called_by` NULL = chamado pela estacao).
  `/garcom/pedidos` arquivada como redirect pra `/waiter`. Specs TV usam
  psql via `docker exec restaurant-postgres` (porta 5434 nao publicada).

Staff usa poucos `data-testid`; preferir roles, labels e texto visivel:
`Notificações`, `Mensagens`, `Perfil`, `Mais ações`, `NOVOS`,
`PREPARANDO`, `PRONTOS`, `Som ON/OFF`, `Preparar`, `Pronto!`,
`Chamar garçom`, `Marcar como VIP nessa sessão`, `Enviar resposta`,
`Criar conversa`, `Pausas ativas`, `Encerrar agora`, `Aprovar entrada`,
`Rejeitar`, `Nova interação`, `Enviar mensagem`.

## Contratos Criticos

- Multi-tenancy e por schema Postgres. `:slug` resolve
  `public.restaurants.schema_name` e o backend aplica `search_path`.
- Customer auth usa cookie/header `session_token` no Redis.
- Staff auth usa `x-staff-key`; manager/host validam `x-staff-id` no DB.
- WS tem rooms de tenant, session, customer, staff e manager.
- Eventos importantes: `order:*`, `waiter:*`, `scan_verification.*`,
  `late_arrival.*`, `table_merge.*`, `complaint.*`, `staff_message.*`,
  `zone_pause.*`, `session.flag_changed`, `host.*`, `alert.created`.
- Lacunas observadas: `shared-types` tem statuses/roles que podem divergir do
  DB/API atuais (`timeout/cancelled` vs `expired/cooldown_blocked`; roles
  `owner|kitchen` vs `host|cook|bartender|cashier`).

## Matriz De Testes RQS

Use uma metrica agregada de 100 pontos:

- 15: build, typecheck, lint, migrations e `git diff --check`.
- 25: E2E critico de QR, welcome, host approval, pedido, KDS, garcom,
  pagamento, LGPD/chat e noite realista.
- 20: API/data/security: auth, roles, tenant isolation, DTOs, idempotencia,
  Mongo/Redis/Postgres e WS.
- 15: UI/canvas por persona: customer, waiter, manager, host e cozinha.
- 10: wire/mock/placebo: botao clicavel faz acao real ou stub explicito; nunca
  `catch { setSuccess() }` silencioso.
- 10: evidencia/reprodutibilidade: manifest, ambiente, comandos, DB before/after
  e artefatos pequenos.
- 5: performance/flakiness: sem timeouts recorrentes, sem mount errado, sem
  rate-limit dev bloqueando QA.

Classificacao:

- `PASS`: score >= 90, nenhum P0, nenhum P1 confirmado em fluxo critico,
  nenhum HIGH de seguranca/compliance e comandos obrigatorios verdes.
- `PARTIAL`: 75-89, ou P1 disputado/isolado, ou cobertura manual sem automacao.
- `FAIL`: score < 75, qualquer P0, qualquer HIGH security/compliance, build ou
  E2E obrigatorio falhando, ou evidencia ausente para claim critico.

## Comandos De Validacao

Basicos:

```bash
npm run build
npm run lint
npm run format:check
git diff --check
```

Por workspace:

```bash
npm run build --workspace @restaurant/api
npm run build --workspace @restaurant/web-customer
npm run build --workspace @restaurant/web-staff
npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-customer -- tsc --noEmit -p tsconfig.json
npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json
npm run e2e --workspace @restaurant/web-customer
python -m pytest services/ai-service/tests -q
```

Health:

```bash
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3002 >/tmp/staff.html
curl -fsS http://localhost:3003/restaurant_dev >/tmp/customer.html
```

No estado atual da `main`, `scripts/audit-ui.sh` existe por merge do prompt 07.
Ele gera evidencias/auditoria UI, mas nao substitui asserts automatizados TAP ou
E2E; use como apoio, nao como unico criterio de PASS.

## Evidencia

- Evite commitar PNGs em massa. `qa-reports` ja contem muitos artefatos pesados.
- Para rodada nova, preferir `SUMMARY.md`, `matrix.json`, `commands.log`,
  `coverage.csv`, `bug-ledger.md`, `docker-health.txt`,
  `db-before-after.sql.txt`.
- Screenshots: no maximo 1-2 por fluxo critico ou falha. Trace/video/HAR devem
  ficar fora do Git, exceto quando forem indispensaveis para uma falha.
- Para comparacao canvas-vs-impl, use viewport-only e deviceScaleFactor 1; nao
  use fullPage em massa.

## Decisoes E Pendencias De Produto

Decisoes confirmadas por Caleb em 2026-06-09:

- Late-arrival = pessoa chega atrasada e precisa se juntar a uma mesa/sessao
  ja existente.
- Table merge = juncao de mesas. Late-arrival e merge nao devem ir para staff
  como aprovacao ativa; staff recebe apenas mudancas de UI/notificacao passiva.
- Ao aprovar merge, o mapa de mesas do staff deve mostrar visualmente as mesas
  mergeadas como um conjunto/par de mesas. Validacao atual: codigo ainda nao
  tem persistencia/campo de grupo mergeado suficiente para isso.
- Cooldown de merge = 10 minutos.
- Host/recepcionista nao deve ver que um cliente/mesa e VIP. VIP deve aparecer
  para cozinha/bar como prioridade de pedido e para staff no mapa de mesas com
  badge e cor/icone diferente da mesa.
- No mapa de mesas, gerente, garcom e recepcionista podem ver estado VIP quando
  estiverem na funcao de staff operacional de mesas; fora disso, host nao deve
  receber alerta indireto apenas por VIP.
- Timeline e por sessao/mesa/comanda atual, nao por `orderId`. `orderId` fica
  para metricas futuras do dono.
- `/garcom/pedidos` aparenta ser rota legada KDS/manual e precisa de decisao de
  produto antes de virar superficie canonica.
- Evidencia pesada = screenshots/traces/videos/logs em massa versionados no Git.
  Preferir artefatos pequenos e poucos prints por fluxo.
- Politica RQS recomendada: P1 confirmado em fluxo critico bloqueia `PASS`;
  `PARTIAL` so quando o P1 for isolado/disputado ou tiver workaround explicito.

Decisoes detalhadas confirmadas por Caleb em 2026-06-10:

- Mapa do gerente: a estrutura atual de `/manager/operacoes > Mapa` pode ser a
  base, mas ainda precisa implementar visual de mesas mergeadas e VIP. O canvas
  nao tem esse detalhe implementado; nao usar o canvas como fonte final aqui.
- Table-menu do gerente/staff: o contador de pessoas no hero deve refletir a
  quantidade real de usuarios atualmente na mesa/sessao. A secao Cliente deve
  listar os nomes dos clientes atuais na mesa. Observacao vazia e aceitavel
  quando a mesa nao veio de reserva; se a recepcionista abrir mesa por reserva
  com observacao, essa observacao deve popular a mesa.
- Menu de tres pontos do table-menu deve abrir overlay com acoes reais:
  editar observacao, fechar mesa/comanda, adicionar pessoas na mesa, lidar com
  capacidade conforme os modais do canvas, e outras acoes de mesa. Fechar mesa
  pelo garcom deve colocar a comanda/mesa em estado pronto/liberavel para novos
  clientes escanearem e cairem na logica de aprovacao correta.
- Ao late-arrival aprovado ou merge consumado, a quantidade de pessoas
  comportada/ocupada deve atualizar automaticamente para gerente, garcom e
  recepcionista. A recepcionista deve receber notificacao/passive awareness
  depois da aprovacao pelo customer-host.
- Contatar cliente no table-menu deve funcionar de verdade, nao ficar
  desabilitado/stub.
- Timeline da mesa deve existir por sessao/comanda atual e ser persistida no
  Mongo. Tambem deve haver acesso a sessoes antigas separadas por botoes,
  mostrando quantidade de pessoas e nome da mesa como "mesa de [host daquela
  sessao]"; ao clicar, abre timeline antiga com total, quanto foi pago e demais
  eventos daquela sessao.
- Timeline da sessao atual deve conter todos os eventos relevantes da comanda:
  pedidos, chamados, reclamacoes, cortesias, pagamentos, late-arrival, merge e
  unmerge. `orderId` serve para metricas futuras do dono, nao para a timeline
  operacional de mesa.
- Timeline de mesa mergeada: se comandas continuarem separadas, mostrar as duas
  comandas na mesma tela de forma legivel. Se as comandas forem mergeadas, a
  timeline deve se comportar como uma arvore com duas ramificacoes que se unem
  no ponto do merge; apos isso, novos pedidos entram em uma timeline unica.
- Table merge: ao mergear, abrir overlay perguntando se o cliente quer manter
  comandas separadas ou juntar comandas. Depois da escolha e sucesso, a IA deve
  confirmar que a juncao das mesas deu certo.
- Desfazer merge: gerente pode desfazer. Customer-host pode pedir ao outro
  customer-host antes de mergear. Se desmergear depois de comanda/pessoas
  mergeadas, o sistema deve lembrar a estrutura anterior das mesas, pessoas e
  pedidos, inclusive pedidos novos feitos por pessoas especificas durante o
  periodo mergeado, para restaurar as comandas/mesas corretamente.
- KDS/cozinha/bar: a acao final canonica e "Chamar garcom", nao "Servir agora".
  Ao clicar, deve enviar notificacao in-app/banner para o garcom responsavel.
  O garcom deve ter tela/botao para aceitar a entrega, ver onde fica a mesa
  (varanda, salao principal etc.) com mapa, e marcar "Entregue"; so entao o
  pedido termina e o app do cliente atualiza. Estado atual: `/cozinha/tv` e
  `/bar/tv` ja existem como telas TV e chamam backend real para `_kds` e
  `call-waiter`, mas o fluxo completo de notificacao/mapa/entregue ainda
  precisa de validacao e possivel complemento.
- QR do cliente: se localizacao for necessaria/negada, explicar para leigos que
  a localizacao e usada por seguranca para confirmar que o cliente esta no
  restaurante e liberar o cardapio correto. Texto deve ser curto, claro e
  amigavel para idosos/leigos.
- Geofence: o raio deve ser do restaurante. O dono deve conseguir selecionar a
  localizacao no mapa, definir raio, salvar, persistir no banco e alterar
  depois. A configuracao precisa sobreviver a reinicio da maquina.
- Cliente escaneia QR de mesa ocupada: se nao reconhecido, passa por
  identificacao e pede entrada ao customer-host. Se reconhecido por cookies,
  pula identificacao e pede entrada ao customer-host com dados ja reconhecidos.
- Mesa excede capacidade por late-arrival aprovado: permite a mudanca se o
  customer-host aprovou, atualiza capacidade/pessoas nas UIs de gerente,
  garcom e recepcionista e notifica a recepcionista.
- VIP: apenas gerente e recepcionista podem marcar/desmarcar VIP. Garcom pode
  ver VIP no mapa operacional, mas nao marca. Host nao deve receber alerta
  indireto por VIP. Se houver VIP e alergia, mostrar os dois badges.
- Prioridade de cozinha/bar: devem existir tres filas/prioridades, nesta ordem:
  urgencia, VIP, normal. Pedido VIP sobe automaticamente para a fila VIP.
- Lider de cozinha em `/cozinha/eu`: por agora so pode ver o proprio perfil.
  Manter anotacao/TODO de possibilidade futura do lider gerenciar turnos dos
  assistentes de cozinha; nao tratar essa intencao como lixo de codigo.
- Garcom escaneia QR apenas para lancar pedidos novos em mesa que ele esta
  atendendo, para evitar selecionar manualmente a mesa. Nao usar QR do garcom
  para abrir mesa, validar presenca ou outros cenarios.
- `/garcom/pedidos` deve ser removida/arquivada como rota legada.
- Reclamacao: vira timeline, mensagem/chat, metrica e notificacao para o
  gerente. O gerente responde no chat.
- LGPD/dados: se o cliente pedir exclusao, limpar na hora. Caso contrario,
  apagar historico automaticamente a cada 30 dias.
- Pagamento dividido/customizado: permitir pagar somente itens que o cliente
  pediu + 10%, selecionar itens especificos + 10%, ou informar valor livre com
  10% em cima. A UI deve explicar o acrescimo no calculo total. Frontend pode
  calcular preview, mas backend deve conhecer/validar o valor esperado para
  fechar a conta.
- Fonte canonica geral: decidir tela a tela. Canvas e fonte de pesquisa e
  referencia visual, nao fonte de verdade absoluta; em algumas telas o codigo
  atual ja esta mais novo que o canvas.
- "Staff canon" significa a versao canonica/base das telas de staff. Caleb
  esclareceu que a tela da esquerda no comparativo era garcom e a direita era
  equipe do gerente; nao comparar como se fossem alternativas da mesma tela.
  Usar a versao mais recente por persona/tela.
- P1 confirmado deve ser corrigido e bloqueia merge/release.
- Evidencias pesadas devem ficar fora do Git, em storage externo ou artefato
  temporario; no Git, manter resumo e poucos prints indispensaveis.
- "Botoes sem backend real" significa qualquer CTA que pareca final para o
  usuario mas nao chama API real ou apenas mostra sucesso local. Exemplos
  observados em auditoria: Ver timeline da mesa, Contatar cliente, Avisar
  cozinha, Realocar mesa e Pausa quando estiverem stubados. Esses botoes devem
  ser conectados, removidos/desabilitados, ou marcados explicitamente como em
  desenvolvimento enquanto nao houver backend.
- "Dados demo ruins" significa vazamento de fixture/QA para tela real, por
  exemplo tempos de 14k/44k minutos, mesas QRTEST91/92 e labels tecnicos como
  `ready`. Isso deve ser tratado como problema de seed/QA/UI antes de release,
  nao como comportamento de produto.

Pontos entendidos dos superprompts:

- Prioridade alta: `customer_events` para trocar heuristica de `viu_cardapio`
  por event tracking real.
- Onda 4 finish: wire FE para performance de staff e chamados; construir modulo
  Financeiro real.
- Corrigir CallWaiterSheet drag-to-dismiss em iOS real sem violar V20 locked.
- Adicionar JoinTable/Merge typewriter no chat e StaffBubble history no reload.
- Adicionar CourtesyArrival customer e chips dinamicos de home via continuation.
- Staff V11/V17 deve ser composto por canvas base + deltas recentes, nao por um
  unico arquivo isolado sem contexto.
- Toda tela nova precisa screenshot/Playwright antes de ser marcada pronta.
- Todo CTA precisa API real com erro visivel ou stub explicito de desenvolvimento.

Bugs dos videos de 2026-06-10 corrigidos (assistente + juncao):

- `/assistente` sem threadId volta a abrir a LANDING contextual: o inline
  history hidrata SO mensagens de staff (proposito do round 10) — antes
  reabria a ultima conversa de IA inteira e a landing nunca aparecia.
  Conversas antigas: menu "Conversas com IA".
- Hierarquia do greeting contextual (continuation.service.ts:107-118),
  primeira que casar vence: reclamacao<10min → pagamento<10min → pedido
  ativo<30min → chamou garcom<5min → viu cardapio<10min →
  voltou_sem_acao → first_time. Merge/late-arrival NAO entram no
  greeting — chegam como cards via WS por cima de qualquer landing.
- Card de juncao (rejected/cooldown): "Chamar recepcionista" usa o fluxo
  REAL `POST /:slug/host/assist` (SessionGuard → alert kind
  host_assist_table visivel pro papel host + WS host.assist_requested no
  room tenant:slug:host); "Tentar outra mesa" abre o OverlaySalonMap
  (mesmo caminho do tool call; waiting-approval navega com ?mergeRetry=1);
  "Continuar aqui" dismissa e volta pra landing contextual.
- Cancelar convite na waiting-approval cancela DE VERDADE (reject do
  origin); quem cancelou/recusou nao ve o card "Voces seguem separados".
  Timeout agora emite `table_merge.rejected` rejectedBy='timeout' no
  expireOverdueRequests (antes era UPDATE silencioso e o FE esperava um
  evento que nunca chegava); copy do card varia por motivo.
- ai-service: intencao de NOVA juncao ("quero tentar juntar com outra
  mesa") nao cai no rule layer de status — segue pro tool path/mapa;
  cooldown ativo mantem o bloqueio amigavel de 10min (teste cobre os
  dois). Status terminais respondem com proximo passo, nao eco cru.
- Migrations: 032 ganhou ADD COLUMN IF NOT EXISTS (021 ja criava ends_at
  — sequencia limpa 021→032 quebrava o boot fatal); 003 indexa
  session_token so se a coluna existe (pos-039). ensureOtherTenant (e2e)
  cria o tenant de isolamento REAL: todas as migrations + __migrations__
  (o schema parcial via LIKE derrubava o boot fatal).

Decisoes de Caleb em 2026-06-10 (rodada de perguntas abertas):

- Reclamacoes customer: GET/list definitivos SAO canonicos — ja existem
  (`GET /:slug/complaints/mine` + `GET /:slug/complaints/:id`,
  SessionGuard) e o FE busca no mount + WS `complaint.responded/resolved`.
  Hard reload e deep link funcionam; sessionStorage e so primeira pintura.
- API 3001: direcao decidida = reverse proxy same-origin para nao expor a
  API mantendo-a funcional (staff + WS ainda batem direto na 3001 —
  implementacao pendente; o padrao do /api/proxy do web-staff e a base).
- `migrate-tenants` FATAL: sem migrations os dados nao sao consistentes —
  o `|| echo` foi removido do docker-compose; primeiro boot sem tenants ja
  sai 0 no proprio script.
- Geofence (localizacao/raio): UI vai no DASHBOARD DE OWNER futuro.
- Tempo de espera do cliente: configurado pela COZINHA em `/cozinha/eu`
  (card "Tempo de preparo · ETA do cliente") — migration 056
  (`settings.kitchen_eta_min/max_minutes`), `GET/PATCH
  /:slug/settings/kitchen-eta` (PATCH so cook|manager), e o motor de ETA
  parte desse range, somando fila dinamica e encolhendo por estagio.
- Roteamento garcom↔zona: NAO fazer — mostrar onde a mesa fica
  (varanda etc.) ja atende; mantém alvo = ultimo que atendeu → turno
  ativo → round-robin.

Decisoes de Caleb em 2026-06-11 (fecharam as perguntas 1/2/3/7 + nova spec):

- CallWaiterSheet 22/600: ACEITA como excecao do canon V20. Nao "corrigir".
- `mode=expand`: SEMPRE so preenche o input (nunca autoenvia). E no envio,
  frases diretas (chips/comandos como "ver cardapio", "me indica", "ver
  meu pedido") devem resolver por REGEX/rule-layer no ai-service SEM
  chamar o LLM — mantendo o front como esta (indicadores de tool/teclado
  como se a IA respondesse) pra economizar tokens. So vai pro LLM o que
  precisa de raciocinio real.
- `assistant.staff_message_received`: mudar do room `session:<id>` (mesa
  toda ve) para o room `customer:<customerId>` — SO o cliente que abriu a
  reclamacao/conversa ve a resposta do gerente (cada um tem a propria
  reclamacao). Emit hoje em assistant.service.ts (sendStaffToCustomer →
  emitToSession) — trocar e ajustar o listener do FE.
- Jest/Supertest em apps/api: SIM, formalizar (npm test unico; migrar
  specs ts-node aos poucos).
- Pendencia host UI: RESOLVER — superficie do host mostrando "Mesa X
  pediu a recepcao" em tempo real (alerts kind host_assist_table + WS
  host.assist_requested ja existem no backend).

Spec nova do CONTEXTO DO ASSISTENTE (decisao 2026-06-11 — detalhada no
prompts-codex/100-fable-contexto-assistente-chips-regex.md):

- Problema: com pedido ativo, ir ao cardapio e voltar mostrava sempre o
  contexto de cardapio e NUNCA o do pedido (ou vice-versa) — falta de
  hierarquia visivel + mensagem unica disputada.
- EYEBROW DE STATUS PERSISTENTE: com pedido ativo, a faixa acima da fala
  da IA (hoje "ASSISTENTE · DE VOLTA") mostra SEMPRE o tempo do pedido
  (ETA dinamica ja existente: eta_minutes_min/max) + um ponto/indicador
  com o ESTADO do pedido (Em preparo / Pronto / A caminho — mesmos
  labels/cores da tela Meu pedido), atualizando via WS order:status.
- MENSAGEM DE CONTEXTO CONSUMIVEL (1x por evento): a mensagem de um
  EVENTO (pos-pedido, pos-reclamacao, pos-pagamento, pos-chamado) aparece
  UMA vez apos o evento; depois de exibida, o contexto fica liberado pros
  contextos de navegacao (ex.: voltou do cardapio com pedido em preparo →
  mensagem de cardapio, pois o status do pedido ja esta na eyebrow).
  Persistir o "ja exibido" por sessao+evento (ha precedente parcial:
  clearDeliveredContinuationHint no FE).
- TESTES OBRIGATORIOS dessa matriz de interacoes (continuation service +
  Playwright): cada acao do app → qual mensagem aparece, quantas vezes,
  e o que a eyebrow mostra. Comportamentos esperados descritos no prompt
  100.
- CHIPS DE SUGESTAO CONTEXTUAIS: auditar todos os chips genericos
  ("Sobremesa combina?", "Sugestao leve" etc.) que nao conversam com a
  mensagem atual da IA; chips devem ser coerentes com o estado/ultima
  fala. Cliques de chips e frases diretas roteiam por regex sem LLM (ver
  acima), com bateria de testes de frases reais (positivas → rule layer;
  negativas → LLM) pra garantir que o regex nao engole o que precisa de
  raciocinio.
- BUG a investigar junto: toast vermelho "1 error" aparecendo na landing
  do assistente no iOS (screenshot 2026-06-11, sim iPhone 16) — achar a
  origem (provavel erro silencioso de fetch na landing) e corrigir com
  erro tratado/visivel correto.

Implementacao do prompt 100 (2026-06-12, branch
claude/compassionate-haslett-5b2f60 — regras novas que ficam):

- Canon de status de pedido do customer vive em
  `apps/web-customer/src/lib/orderStatus.ts` (labels/cores/formatEtaCompact)
  — tela Meu pedido e eyebrow do assistente importam de la; NUNCA duplicar
  o mapa nem hardcodar tempo. Eyebrow: `useActiveOrderStatus` (sem socket
  proprio — refresh vem do socket da page + poll 60s).
- Continuation consumivel: kinds de evento (pos_reclamacao, pagou,
  abriu_pedido, chamou_garcom) sao 1x por evento via Redis
  `continuation_shown:<tableSessionId>:<kind>:<eventId>` (TTL 4h). SO a
  superficie `assistente` consome (POST /continuation com
  `surface:'assistente'`); home le sem queimar; fallback do AI service NAO
  consome; clientKindHint nao fura consumo; evento novo (id novo)
  re-libera. A derivacao PULA consumidos e cai pro proximo da hierarquia.
- Chips: mapa kind→chips vive no BACKEND (pools de continuation.py +
  chips das tools). DEFAULT_SUGGESTIONS do FE são so fallback e todos os
  payloads resolvem no rule-layer sem LLM. ATENCAO: pools sao seedados no
  Redis com TTL 1h (`continuation:<tenant>:<segment>`) — mudou DEFAULTS,
  flush `continuation:*` ou espere o TTL pra ver no stack.
- Rule-layer sem LLM: o contrato e a guarda `_is_direct_phrase` (≤6
  palavras, sem negacao) + a bateria
  services/ai-service/tests/test_rule_layer_phrases.py. TODA regra nova
  entra na bateria (positivas → rule, negativas → LLM). "falar com
  gerente" responde texto que CASA com _MANAGER_MESSAGE_PROMPT_RE — e
  assim que o turno seguinte vira send_message_to_manager sem LLM.
  mode=expand segue SO preenchendo o input.
- Resposta do gerente: POST /assistant/staff-to-customer exige
  `toCustomerId` (participante aprovado); persiste customer_id; WS
  `assistant.staff_message_received` vai SO pro room
  `customer:<toCustomerId>`; GET /assistant/history filtra staff msgs por
  destinatario (legado customer_id NULL continua visivel pra mesa).
- LIMITACAO CONHECIDA (pergunta aberta pro Caleb): o token de sessao e
  COMPARTILHADO pela mesa (token == tableSessionId) e o payload Redis
  `session:<id>` guarda UM customerId (ultimo welcome/identify via
  attachCustomerToSession). `join:customer` so autentica o ULTIMO
  attachado — destinatario "antigo" da mesa recebe a resposta privada no
  reload (history) mas pode nao receber em realtime. Resolver de verdade
  exige credencial por participante no handshake WS (ex.:
  recognition_token) — decisao de produto pendente.
- Socket do customer e COMPARTILHADO:
  `apps/web-customer/src/lib/customerSocket.ts` (refcount + linger 5s +
  retry pos 'io server disconnect'). NAO criar `io()` novo em hook/page
  customer — o gateway rate-limita 30 handshakes/60s POR IP (restaurante
  inteiro sai pelo mesmo IP). useTableSocket/useCustomerHostEvents/
  useComplaintEvents ja usam o shared (o useComplaintEvents antigo nem
  autenticava — so queimava rate-limit).
- Toast "1 error" (bug 2026-06-11) RESOLVIDO: era a chave de viewport
  `interactive-widget` (Chromium-only) — WebKit loga console.error em
  toda pagina e o dev overlay do Next 14 conta console.error no badge.
  NAO reintroduzir a chave (teclado ja e tratado via visualViewport).
  Segunda fonte (WS fechado em pleno handshake a cada navegacao) sumiu
  com o socket compartilhado.
- apps/api tem Jest/Supertest: `npm test --workspace @restaurant/api`
  roda `*.test.ts`; `*.spec.ts` legados sao ts-node manuais (migracao
  gradual — padrao em apps/api/TESTING.md; template supertest em
  continuation.controller.test.ts).
- Host: WS `host.assist_requested` esta em DEFAULT_HOST_EVENTS; inbox
  /host/inbox inclui alerts `host_assist_table` abertos como kind
  `host_assist` ("Mesa X pediu a recepcao") com beep + badge AGORA +
  resolve real via POST /alerts/:id/resolve (host pode agir — pattern
  'host' em ROLE_ALERT_PATTERNS).
- E2E novo: e2e/specs/assistente-context.spec.ts (serial; matriz do
  prompt 100 §7 + rule-layer UX + privacidade). Higiene de beforeAll:
  alem de throttle:*, limpar continuation_shown:*, customers:welcome:*,
  customers:identify:* (locks de 15min de runs anteriores derrubam o
  newSession). PATCH /orders/:id/status NAO aceita in_transit (so o
  fluxo de entrega do garcom) — ready→delivered direto e valido.
