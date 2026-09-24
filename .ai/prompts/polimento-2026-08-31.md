# Prompt de polimento — restauranteSaaS

> Cole este arquivo inteiro numa sessão nova do Claude Code, na raiz do repo.

Este é o `restauranteSaaS`: monorepo de um SaaS de restaurante com API NestJS (`apps/api`,
:3001), app da equipe (`apps/web-staff`, :3002 — garçom, recepção, cozinha/bar, gerente,
owner), app do cliente (`apps/web-customer`, :3003) e um serviço de IA em Python
(`services/ai-service`). A memória do projeto está em `MEMORY.md` (decisões de produto,
contratos, comandos de validação), `CLAUDE.md` (regras invioláveis, incluindo os arquivos
V20 do cliente que **não podem** ser mexidos visualmente) e `.rag-drafts/` (mapeamentos de
superfície do garçom e do gerente + inventário de features, feitos em 2026-08-03 com
verificação ao vivo). **Leia os três antes de tocar em qualquer arquivo.**

O que segue é a fila de polimento em ordem de impacto no usuário ÷ esforço. Cada item tem
sintoma, arquivo e critério de aceite verificável. Faça um item por commit.

---

## 0. Antes de codar — 4 decisões que são do Caleb, não suas

Não implemente nada destes quatro pontos sem resposta explícita. Pergunte, espere, registre a
decisão em `MEMORY.md`.

**D1 · System B de late-arrival: matar ou ligar? → ✅ RESOLVIDO (2026-08-31): MATAR.**
O dono decidiu apagar o B. Executado: `late_arrival_requests` e o enum de status saíram na
**migration 081** (idempotente, aplicada nos 4 tenants), junto com o módulo
`apps/api/src/modules/late-arrival/`, as rotas `*/late-arrival-requests*`, os eventos WS
`late_arrival.*`, o `sweepLateArrivals`, a fonte de late-arrival do host-inbox e da timeline,
e as telas `ScreenCustomerHostApproveJoin` (+ `/host/approve/join`) e `ScreenHostLateArrival`
(+ `/host/late-arrival/:id`). `CLAUDE.md`, `MEMORY.md` e
`docs/features/customer-host-model.md` foram corrigidos no mesmo passo.
O motivo não foi "código morto": as colunas `escalation_level`, `escalation_chain_id`,
`approved_by_staff_id` e `ttl_expires_at` implementavam a **escalada pra staff que a decisão
de produto V16 descontinuou** — era a versão anterior à decisão sobrevivendo como segunda
verdade. Fluxo único agora: `session_participants`, host da mesa aprova.
Consequência assumida: **a recepção perdeu a tela `ScreenHostLateArrival` e a seção
"Chegadas tardias" da `/host`** — que já eram sempre vazias (0 linhas nos 4 tenants). O que
deveria alimentá-las está no item **4.10** abaixo, e não foi implementado.

**D2 · Provider de push.**
`apps/api/src/modules/jobs/push.service.ts` é um stub de 27 linhas que devolve
`provider_not_configured`. Consequência medida: `order_ratings` tem 60 linhas, **55 são
prompts que nunca foram entregues**, e a submissão real mais recente é de 2026-07-04. Ou
escolhe-se um provider, ou troca-se a estratégia (chip in-app, e-mail, QR no comprovante) e
remove-se o job que varre em vão (`rating-push.service.ts`).

**D3 · Caixa entra no roadmap?**
`apps/web-staff/src/app/cashier/CashierAccessGate.tsx` exige `staffRole === 'cashier'` por
igualdade estrita e **não existe nenhum usuário `cashier` no seed** (11 linhas em `staff`:
cook 3, host 2, manager 2, owner 1, waiter 3) — ninguém consegue chegar na tela. E a tela é
holding page ("Caixa ainda não ativado"). Decidir: criar usuário + workflow de liquidação, ou
assumir que caixa está fora do escopo e documentar isso onde alguém vá ler.

**D4 · LLM: LM Studio local na LAN ou provider gerenciado?**
`LLM_BASE_URL=http://<IP-da-LAN>:1234/v1` (modelo `qwen3.6-35b-a3b-...`) está inalcançável a
partir do container `restaurant-ai`. O app degrada bem — frases do rule-layer respondem em 0 s
(`model=rule-layer`) — mas qualquer outra coisa pendura ~90 s e devolve 503
(`"Desculpe, estou com dificuldade no momento…"`). Enquanto isso não for decidido, **toda
demo depende do rule-layer**.

---

## 1. Segurança e integridade — antes de qualquer cosmética

### 1.1 `/dashboard/funcionarios` cria staff que nunca consegue logar, e não tem guard de role

**Sintoma:** a tela pede um PIN, mas o servidor ignora o PIN do browser e gera um temporário
que essa página descarta — o funcionário criado ali **nunca loga**. Além disso a rota não tem
guard de role nenhum no client. O caminho correto já existe: `/manager/equipe/novo`, que
exibe `PIN provisório:`.
**Arquivos:** `apps/web-staff/src/app/dashboard/funcionarios/`, `apps/web-staff/src/app/dashboard/page.tsx`.
**Aceite:** ou a rota é removida e qualquer link para ela some, ou ela ganha guard de role e
passa a exibir o PIN provisório retornado pela API. Teste: criar staff pelo caminho que
sobrar e **logar com o CPF+PIN resultantes** — sem isso o item não está pronto.

### 1.2 `/dashboard` legado é órfão e desalinhado

**Sintoma:** nada linka pra `/dashboard` (é só o branch de fallback de `homeForStaffRole`),
aceita manager **ou** owner, tem copy sem acento (`Avaliacao (30d)`, `Promocoes`,
`Acesso rapido`) e o gráfico de 7 dias mostra uma barra só.
**Arquivos:** `apps/web-staff/src/app/dashboard/**`.
**Aceite:** decidir junto com 1.1. Se ficar, acentuação corrigida e guard aplicado; se sair,
`grep -rn "/dashboard" apps/web-staff/src` não retorna referência viva.

---

## 2. One-liners com efeito visível (maior impacto ÷ esforço do repo)

### 2.1 A aba "Turno" do garçom abre o Perfil

**Sintoma:** o bottom nav tem 5 abas, mas `Turno` e `Eu` levam à mesma tela. O `focus=shift` é
escrito na URL e **nunca lido**.
**Arquivos:** `apps/web-staff/src/app/waiter/eu/page.tsx:35` (escreve `&focus=shift`),
`apps/web-staff/src/screens/waiter/ScreenWaiterProfile.tsx`.
**Aceite:** com `?focus=shift` a tela abre rolada/expandida na seção de turno (ou existe uma
tela de turno de fato). Sem o parâmetro, comportamento atual intacto. Se a decisão for que
turno não é uma aba, **remover a aba** — 5 abas que viram 4 é resultado válido.

### 2.2 A pill `Em turno · HHh MMm` nunca renderiza

**Sintoma:** `shiftDurationMin` tem default `0` e a page nunca passa o valor, então a pill é
código morto.
**Arquivos:** `apps/web-staff/src/screens/waiter/ScreenWaiterProfile.tsx:50` (prop com default 0) e `:138` (render condicional).
**Aceite:** garçom escalado hoje vê a pill com duração > 0; garçom fora de turno não vê pill
nenhuma (não é "0h 00m"). Um teste unitário cobrindo os dois estados.

### 2.3 Três mapas de label divergentes para o mesmo `reason`

**Sintoma:** `place_order` aparece como `Anotar pedido` na lista, `Fazer pedido` no detalhe e
`Anotar pedido` no banner. `ask_bill`: `Cliente pediu a conta` / `Pedir conta` /
`Pediu a conta`. `other`: `Sem motivo informado` / `Outro motivo` / `Chamou garçom`.
**Arquivos:** `apps/web-staff/src/screens/waiter/ScreenWaiterCalls.tsx`,
`apps/web-staff/src/screens/waiter/ScreenWaiterCallDetail.tsx:69`,
`apps/web-staff/src/components/waiter/WaiterDeliveryAlerts.tsx`.
**Aceite:** um único mapa exportado de um módulo compartilhado, consumido pelos três. Um
`grep` pelos literais antigos não acha duplicata. O texto que o cliente escolheu na sheet
(`apps/web-customer/src/components/ui/CallWaiterSheet.tsx`) é a referência para o rótulo.

### 2.4 Copy sem acento em telas legadas

**Sintoma:** `PIN invalido` no unlock da TV; `QR FISICO ·` e `Inspecao` no detalhe do scan
(enquanto o card da home da recepção diz `QR FÍSICO ·` com acento); `Titulo`,
`Nenhuma promocao cadastrada.` em `/dashboard/promocoes`.
**Aceite:** `grep -rnE "invalido|FISICO|Inspecao|Titulo|promocao" apps/web-staff/src` sem
resultado em string voltada ao usuário. Cuidado: alguns specs assertam o texto sem acento —
atualizá-los no mesmo commit.

### 2.5 Merge: a copy promete 20 min, o cooldown é 10

**Sintoma:** a mensagem de rejeição diz "tente de novo em 20 min"; `MEMORY.md` registra a
decisão de produto de cooldown = 10 minutos, e é isso que o backend faz.
**Aceite:** a copy diz 10 minutos e um teste amarra o número ao valor do backend em vez de
repetir o literal.

### 2.6 A sheet de LGPD sempre diz "conversas com a equipe"

**Sintoma:** em `/[slug]/eu` → `PRIVACIDADE` → `Apagar minhas conversas`, o corpo da sheet
fala em "conversas com a equipe" mesmo quando o usuário escolhe apagar as conversas com a
**IA**.
**Aceite:** o corpo reflete a opção selecionada nos três casos (equipe / IA / todas).
**Não** mexa no fluxo em si — atenção ao ponto 4.4, que é outro problema no mesmo lugar.

---

## 3. Falhas silenciosas (o usuário clica e nada acontece)

### 3.1 Cancelar chamado depois do acknowledge falha sem feedback

**Sintoma:** a API devolve `400 Chamado já atendido, não pode cancelar.` e o `cancel()` não
tem `catch` — promise rejeitada, zero feedback na tela. O botão fica lá, clicável, mentindo.
**Arquivo:** `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaiterCallWaiting.tsx:124`.
**Aceite:** com o chamado em `acknowledged`, o botão `Cancelar chamado` fica desabilitado
(ou vira mensagem explicando que o garçom já está a caminho); se ainda assim a API recusar,
aparece erro visível. Teste cobrindo o 400.

### 3.2 Card de reclamação sem sessão trava em loop mudo

**Sintoma:** `Responder` só abre a sheet quando a reclamação tem `tableSessionId` **e**
`customerId`. Sem isso navega para `/manager/chamado/<id>?kind=complaint`, que redireciona
para `/manager?replyComplaint=<id>`, que não acha os campos — nada acontece, sem erro. Hoje,
das 6 reclamações abertas em dev, só 3 são resolvíveis.
**Arquivos:** `apps/web-staff/src/screens/manager/ScreenManagerHomeA.tsx`,
`apps/web-staff/src/components/manager/MContactClientSheet.tsx`,
`apps/web-staff/src/app/manager/chamado/[id]/`.
**Aceite:** reclamação sem sessão resolvível mostra estado explícito (ex.: "sem sessão
vinculada — responder por outro canal") e o botão não promete o que não entrega. Nenhum
caminho termina em redirect silencioso.

### 3.3 `waiter:resolved` não tem consumidor no front

**Sintoma:** nem o app do garçom nem o do cliente assinam `waiter:resolved`; o
`waiter:acknowledged` é assinado e não consumido. Concluir um chamado leva de 5 a 10 s para
sumir das telas, tudo por poll.
**Arquivos:** hooks de socket do garçom (`useWaiterEvents`) e do cliente (`useTableSocket`),
`apps/web-staff/src/screens/waiter/ScreenWaiterCalls.tsx`.
**Aceite:** com dois browsers abertos, o `Atendido` do garçom remove o chamado da tela do
cliente em menos de 1 s, sem esperar o poll. Idem para o card na aba Chamados.

### 3.4 O card `MENSAGEM PRA VOCÊ` existe e nunca é montado

**Sintoma:** o kind `staff-message-unread` está implementado no componente, mas o `refreshAll`
não popula esse kind — só pauses, complaints, merges e LGPD.
**Arquivo:** `apps/web-staff/src/screens/manager/ScreenManagerHomeA.tsx`.
**Aceite:** mandar uma mensagem staff→gerente faz o card aparecer em `Em curso`; ou o kind é
removido do componente. Não deixe código que finge existir.

### 3.5 A coluna `EM TRÂNSITO` do KDS se esvazia sozinha

**Sintoma:** a query derruba pedidos `in_transit` cujos itens já estão todos `ready`, então na
prática a coluna fica `Vazio` e o card some depois do claim do garçom.
**Arquivo:** `apps/api/src/modules/orders/kds-query.service.ts:237`.
**Aceite:** depois de `POST /:slug/orders/:id/in-transit`, o card aparece em `EM TRÂNSITO` no
`/cozinha` e some só no `delivered`. Teste de integração no `kds-query.service.test.ts`
cobrindo o estado `in_transit` + itens `ready`.

### 3.6 `rate_visit` é bolha sem destino

**Sintoma:** a tool devolve `Te mando pra tela de avaliação — leva 30 segundos.` e não há
branch de front nem chips — o cliente lê a promessa e não vai a lugar nenhum.
**Arquivos:** `services/ai-service/services/tools/rate_visit.py`,
`services/ai-service/services/tools/__init__.py:249`, e o dispatcher de tools do
`apps/web-customer`.
**Aceite:** ou a tool navega de fato para a tela de avaliação, ou é removida do registry e do
`schemas.py`. Rodar `services/ai-service/tests/test_tools_registry.py` depois (o teste lista
`rate_visit` explicitamente — atualize junto).

### 3.7 `request_check` é código morto em três camadas

**Sintoma:** fora do schema do LLM, curto-circuitado pelo rule layer e **ativamente removido
pela API** (`rescuePaymentTool` filtra). Continua no registry confundindo quem lê.
**Aceite:** removido do registry e dos testes, ou reabilitado ponta a ponta. Deixar como está
não é opção — hoje ele existe só para enganar a próxima pessoa que ler o código.

---

## 4. Consistência de produto

### 4.1 "Pausar zona" pausa um garçom

**Sintoma:** a migration 032 refatorou `zone_pauses` de `zone_id` para `waiter_id`. A tela, a
rota (`/manager/pausa-zona`) e a copy (`Pausar zona`, `ZONA PAUSADA · comandas bloqueadas até
HH:MM`) continuam falando em zona. O efeito real é individual.
**Arquivos:** `apps/web-staff/src/screens/manager/ScreenManagerOrdersPause.tsx`,
banner em `apps/web-staff/src/screens/waiter/ScreenHomeGrid.tsx`.
**Aceite:** copy alinhada ao comportamento (pausar _garçom_), sem mudar o contrato da API. Se
o Caleb quiser pausa por zona de verdade, isso vira decisão de produto — não invente.

### 4.2 "Turnos de hoje" nunca reflete a escala

**Sintoma:** a seção lê `staff.default_shift` (preferência de cadastro), não
`staff_shift_assignments` (escala real do dia). Continua em "0 funcionários" depois de escalar
4 pessoas. Pelo mesmo motivo, "Em campo 10/10" não é presença — é contagem de contas ativas, e
a própria tela `/manager/equipe/em-campo` admite que "o app ainda não registra login/entrada".
**Arquivo:** `apps/web-staff/src/screens/manager/` (tela Equipe).
**Aceite:** escalar N pessoas no turno de hoje faz a seção mostrar N. E o tile "Em campo"
ganha rótulo honesto (ex.: "contas ativas") ou sai.

### 4.3 Comentários de código que mentem

**Sintoma:** `ScreenManagerShiftEditor.tsx:26-28` diz que os endpoints de turno "ainda nao
existem. Mock data inline ate o backend shipar" e `ScreenManagerStaffForm.tsx:24-26` diz o
mesmo de `POST /staff/create` e `PUT /staff/:id/edit`. **Os dois são falsos** — o corpo dos
arquivos chama `api.shifts.*` e o `ShiftsController` responde 200.
**Aceite:** comentários apagados. Custo: 2 minutos. Impacto: ninguém mais deduz "é só mock"
pelo cabeçalho.

### 4.4 O botão de LGPD não é o botão de LGPD

**Sintoma:** `/[slug]/eu` → `PRIVACIDADE` → `Apagar minhas conversas` chama os endpoints de
delete de chat e **nunca toca** `POST /:slug/lgpd-requests`. A erasure de verdade só nasce do
chip dentro do chat do assistente.
**Aceite:** decisão de nomenclatura antes de código — ou a tela ganha uma entrada explícita
para a solicitação LGPD, ou a copy deixa claro que aquilo apaga conversas e não é o direito do
Art. 18. **Não altere o invariante de segurança**: `confirm` só vale com `origin == "chip"` e
tool-call do modelo nunca apaga (`MEMORY.md`, auditoria 2026-07-11).

### 4.5 Perda de `?slug` em vários `router.push`

**Sintoma:** "Editar turnos →", "Voltar" do editor, "Adicionar funcionário", o close do
StaffForm e a bottom-nav todos navegam sem o slug. Só não quebra porque
`NEXT_PUBLIC_TENANT_SLUG=restaurant_dev`; em multi-tenant cai no tenant errado em silêncio.
**Aceite:** um helper de navegação que preserva `slug` sempre, e um teste que falha se algum
`router.push` de tela de gerente perder o parâmetro.

### 4.6 `workDate` UTC no front vs data civil `America/Sao_Paulo` no backend

**Sintoma:** o front manda `new Date().toISOString().slice(0,10)`; o backend usa a data civil
de São Paulo em zone-assignments e no cálculo de `onShift`. Entre 21h e 23h59 local a escala é
gravada num dia e lida em outro — exatamente durante o serviço da noite.
**Aceite:** uma única definição de "hoje" compartilhada, com teste rodando às 22h local.

### 4.7 Dois "atrasado" e dois "sobrecarga" com o mesmo nome

**Sintoma:** atraso do gerente = `MIN(order_items.prep_started_at) < now() -
settings.kitchen_eta_max_minutes` (kitchen-only, `mi.kind <> 'drink'`); atraso da TV =
`LATE_THRESHOLD_MIN = 12` hardcoded sobre `orders.created_at`. Sobrecarga no tile de
`/manager/equipe` = ocupação de zona ≥80%; em `/manager/equipe/sobrecarga` =
`waiterWorkload.imbalance.highestWaiterId`. As telas podem discordar entre si.
**Arquivos:** `apps/web-staff/src/components/tv/TvKdsBoard.tsx`, dashboard do gerente.
**Aceite:** ou os nomes divergem (é legítimo ter dois conceitos, desde que se chamem
diferente), ou a definição converge. `MEMORY.md` já avisa para não reaproveitar a ocupação
integral de zone-assignments no drill-down — respeite isso.

### 4.8 Acessibilidade em pontos de escala

**Sintoma:** o botão "Adicionar funcionário a este turno" tem nome acessível **vazio** na
árvore AX (medido ao vivo no Chrome), e o cargo no MemberRow é o role cru do banco (`waiter`,
`manager`, `host`), maiúsculo só por CSS.
**Aceite:** `getByRole('button', { name: /Adicionar funcionário/ })` resolve, e os cargos
passam por um `ROLE_LABEL` que cobre **todos** os roles (hoje `manager` e `host` vazam crus em
`ScreenManagerStaff.tsx:62-68`).

### 4.9 Copy do cliente não casa com a narrativa da recepção

**Sintoma:** esperando pela recepcionista a tela do cliente diz `Aguardando host da mesa` e
"…foi avisado · ele tá decidindo se você pode entrar", porque o wrapper reusa
`mode='late-arrival'` e o `hostName` cai no literal "equipe". Na rejeição por staff:
`O host da mesa não autorizou`.
**Arquivo:** `apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx`
— **arquivo travado por design em `CLAUDE.md`**. Mudança de copy exige pedido explícito do
Caleb; layout e tokens ficam intactos.

### 4.10 A "notificação passiva ao staff" prometida na V16 não existe

**Sintoma:** `docs/features/customer-host-model.md` promete, na decisão de escopo V16, que
"Staff só recebe **notificação passiva depois da aprovação consumada**". Essa notificação
**nunca foi construída**. O System A emite `participant:join_request` e `participant:decision`
por `emitToSession`, que faz `server.to('session:<id>')` — **a sala da própria mesa, e só
ela**. As telas de staff assinam `tenant:<slug>` e as salas de papel; nenhuma delas recebe
esses eventos. Consequência operacional: **entra gente na mesa e a recepção não fica sabendo**
— nem card, nem badge, nem linha de inbox. Até 2026-08-31 isso ficava escondido atrás do
System B, cuja tela de recepção existia mas era sempre vazia (0 linhas nos 4 tenants); com o
System B removido (D1), a lacuna está exposta. Nota: a mesma promessa aparece de novo em
`MEMORY.md` ("a recepcionista deve receber notificação/passive awareness depois da aprovação
pelo customer-host") e no item de exceder capacidade ("notifica a recepcionista").

**Arquivos:**
`apps/api/src/modules/table-session/table-session.service.ts:496` e `:533`
(`emitToSession(..., 'participant:join_request', ...)`), `:597` e `:650`
(`emitToSession(..., 'participant:decision', ...)`);
`apps/api/src/modules/websocket/events-emitter.service.ts:344` (`emitToSession` = só
`session:<id>`); `apps/api/src/modules/host/host-inbox.service.ts` (agrega 4 fontes, nenhuma é
`session_participants`); `apps/web-staff/src/hooks/useHostEvents.ts` (lista de eventos
assinados pela recepção).

**Aceite:** com a home da recepção aberta em um browser, um cliente entra pelo QR de uma mesa
ocupada e o host aprova em outro; em menos de ~2 s a recepção vê a entrada sem recarregar.
A notificação é **passiva**: awareness pós-decisão, **sem nenhum CTA de aprovar/rejeitar** —
o backend nega staff nesse caminho por construção, e um botão que dá 401 é exatamente o
padrão que a decisão do gate 1D já removeu uma vez. Cobrir com teste que o item aparece
depois de `approved` e **não** aparece enquanto o participante está `pending`.

**Antes de codar, três coisas são decisão do Caleb, não sua:** (a) o canal — linha no
`/host/notifications` (precisa de um `HostInboxKind` novo e de uma fonte SQL sobre
`session_participants`), card na home, ou só o contador do mapa de mesas; (b) se a recusa do
host também notifica, ou só a aprovação; (c) se o gerente entra junto ou é só recepção.
**Não implemente sem essa resposta** — a promessa da V16 não diz qual das três.

---

## 5. Seed e config — o que impede a demo de existir

Nada aqui é bug de código. É dado ausente, e cada item apaga uma tela inteira.

### 5.1 Zero sessões de mesa ativas

Todas as 859 linhas de `table_sessions` estão `closed`. Sem sessão ativa não há cortesia, VIP,
mapa de mesas, home do garçom, KDS com movimento nem split. Já existe seeder em
`apps/web-customer/e2e/demo-linkedin/preparar-noite.ts` — use e estenda ele, não escreva outro.
**Aceite:** `GET /:slug/host/tables` retorna ao menos uma mesa com `active_session_id`.

### 5.2 Sem bartender, sem bebida em pedido aberto

Zero `cashier` e zero `bartender` em `staff`. Cozinheiro que agir no `/bar` toma 403
(`apps/api/src/modules/orders/orders.controller.ts:445-460`) — só manager/owner avançam item
de bar. E há 6 bebidas no cardápio mas **nenhum pedido aberto contém bebida**:
`_kds?station=bar` devolve `{"orders":[]}`.
**Aceite:** login de bartender existe, `/bar` mostra ao menos um card, e o botão
`▶ Preparar` funciona sem 403.

### 5.3 Promoções todas expiradas

`Happy Hour 20% OFF` (até 2026-07-07), `Combo Almoco` (2026-06-07), `Sobremesa Gratis`
(inativa). O filtro de billing exige `valid_until > now()`, então `discountCents` é sempre 0.
**Aceite:** existe promoção válida e a linha de desconto aparece em `/[slug]/pagamento`.

### 5.4 Financeiro zerado

Pagamentos confirmados existem só em 2026-05-09 (R$ 293,40); nem a janela de 30 dias alcança
hoje. `Mais vendidos` exige sessão totalmente paga → `Sem vendas registradas.`
**Aceite:** ao menos uma conta fechada com pagamento confirmado dentro da janela de "Hoje".
(O KPI `Pendentes hoje` mente: é all-time, sem filtro de data — corrija junto.)

### 5.5 `kitchen_eta_max_minutes` NULL

Sem essa config o `lateOrders` é sempre `[]` e a tela mostra banner amarelo
`Meta da cozinha não configurada` com contador `—`.
**Aceite:** valor configurado nas settings do tenant dev e o card de alerta renderiza.

### 5.6 `TV_ACCESS_PIN` vazio

Vazio no `.env`, no `docker-compose.yml` e no container. As duas TVs abrem sem prompt e
`/cozinha/unlock` (não existe `/bar/unlock`) aceita **qualquer** string em dev, devolvendo
`{ok:true, dev:true}`.
**Aceite:** PIN configurado em dev, TV pede PIN, PIN errado é recusado. Isso é pré-requisito
para tratar a proteção da TV como real em qualquer conversa de produção.

### 5.7 Cardápio sem `preferences` e `sizes`

Os 23 itens do tenant dev têm as duas colunas NULL, então as seções "Preferências" e "Tamanho"
(condicionais) não aparecem. E `DrinkDetail.tsx` não tem textarea de observação — observação
livre só existe em comida ou na `/pedido/revisar`.
**Aceite:** ao menos 3 itens com `preferences` populado e os chips renderizando.

### 5.8 Fixture de QA vazando na tela real

`Mesa 91 · QR Teste 91 · Varanda` aparece no card da recepção e no mapa do gerente. Trocar
para M01..M08 exige adaptar os helpers de reset e a fixture de HMAC — decida antes, não durante
uma gravação.

---

## 6. Dívida grande (não é polimento, é projeto)

- **CPF-only auth.** Decisão temporária do Caleb (2026-07-11): `welcome`/`identify` aceitam
  CPF conhecido como autenticação e emitem o token canônico. **Isso mantém o release em
  PARTIAL** por risco conhecido de account takeover. A correção é canal verificado + OTP
  one-time ou recuperação presencial, depois credencial por dispositivo e revogação dos tokens
  antigos — **nunca uma mudança silenciosa**. Não "conserte" isso por conta própria.
- **9 staff-tools da IA sem superfície** (`staff_broadcast`, `staff_assign_call`,
  `staff_resolve_call`, `staff_pause_zone`, `staff_unpause_zone`, `staff_mark_vip`,
  `staff_unmark_vip`, `staff_respond_complaint`, `staff_resolve_complaint`): não há chat de IA
  no `web-staff` e o `apps/api` nunca manda `is_staff=true`. Ou nasce a superfície, ou saem.
- **`GET /threads` tem efeito colateral:** cria as threads de turno do caller. Um GET que
  escreve é armadilha para cache, retry e teste.
- **Deep-link frio de `/orders/:id/rating`** perde a corrida de ~50 ms com a rehidratação do
  `SessionProvider` no primeiro load e bounça pra home; no segundo passa.
- **Duas advisories MODERATE** no PostCSS interno do `next@16.2.10` — **não** aplicar o fix
  sugerido, que força downgrade pro Next 9.3.3.
- **Pix é stub intencional** (decisão Caleb 2026-07-04, caminho em `docs/PIX-STATUS.md`).
  Qualquer scan apontando "Pix sem estado terminal / sem webhook" é isto, é esperado, não
  conserte.

---

## Regras da casa

1. **Anti-placebo: prove antes de afirmar.** Nada de "corrigido", "funcionando" ou "verde"
   sem a saída do comando colada. Se a mudança é visível, abra a tela e veja; se é de dados,
   rode a query antes e depois. Este repo já teve caso de comentário de código afirmando que
   endpoint não existia enquanto ele respondia 200 — não repita o padrão.
2. **Rode a suíte antes de declarar verde.** `npm run build`, `npm run lint`,
   `npm run format:check`, `git diff --check`, e os testes da área que você tocou
   (`npm test --workspace @restaurant/api`, web-customer, web-staff, e os do `ai-service`).
   O baseline fechado é 1.597 testes; se o seu número for menor, explique por quê. Não
   reformate `qa-reports/`.
3. **`MEMORY.md` atualizado no mesmo commit** sempre que a mudança afetar comportamento de
   produto, contrato back/front, rota de persona, prompt, comando de validação, risco conhecido
   ou questão em aberto. Memória desatualizada é pior que ausente.
4. **Respeite os arquivos travados.** `CLAUDE.md` §"V20 Customer UI · DO NOT MODIFY" lista as
   telas do cliente cujo visual foi desenhado à mão. Bugfix funcional preservando 100% da
   aparência é permitido; mudar token, tipografia, layout ou copy exige pedido explícito.
5. **Nada de atribuição de IA nos commits.** Sem `Co-Authored-By` de assistente, sem
   "Generated with", sem emoji de robô. Mensagem de commit descreve a mudança, ponto.
6. **Um item por commit**, com o critério de aceite verificado no corpo da mensagem.
7. **Não commite evidência pesada** (PNGs em massa, traces, vídeos, HAR, dumps). Prefira
   `SUMMARY.md`, `matrix.json`, `commands.log`.
8. **Em dúvida sobre comportamento de produto, pergunte ao Caleb.** Não invente regra — este
   documento existe justamente porque quatro auditorias encontraram telas que prometiam coisas
   que o código não fazia.
