# Prompt 2 · Validação cross-simulator + bug-hunt segunda leva

> **Como usar:** rodar **DEPOIS** que o Prompt 1 mergou os 6 PRs de fix.
> Pré-condição absoluta: stack inteira viva e estável. Cola num chat novo
> de Claude Code dentro do repo. O orquestrador dispara N subagentes em
> paralelo via Agent tool (run_in_background=true), cada um operando 2-4
> simuladores ao mesmo tempo via xcodebuildmcp + Playwright + queries DB.

---

## Pré-flight (obrigatório antes do prompt)

Confere todos checks ANTES de disparar subagentes — qualquer falha aqui
invalida a rodada inteira.

```bash
cd /Users/calebmedeiros/meus_projetos/restauranteSaaS

# 1. Stack docker
docker-compose ps   # Postgres, Redis, MongoDB up
docker exec restaurant-postgres psql -U postgres -c '\l' | grep restaurant_dev
docker exec restaurant-mongo mongosh --eval 'db.adminCommand({ping:1})'

# 2. LM Studio
curl -s http://127.0.0.1:1234/v1/models | grep qwen

# 3. Apps
curl -i http://localhost:3001/api/health        # API NestJS
curl -i http://localhost:3002                   # web-staff
curl -i http://localhost:3003                   # web-customer
curl -i http://127.0.0.1:8000/health            # ai-service

# 4. CORS sanity (Subagent 1 do Prompt 1 mergou?)
curl -i -X OPTIONS http://localhost:3001/api/restaurant_dev/zone-pauses \
  -H "Origin: http://localhost:3002" -H "Access-Control-Request-Method: GET" \
  | grep -i "access-control-allow-origin"   # deve mostrar :3002

# 5. Sims iOS prontos
xcrun simctl list devices booted | head -10   # ≥ 4 sims booted
```

Se algum check falhar, **PARA** e me avisa.

---

## Prompt

Você é o orquestrador da segunda leva de validação E2E. A primeira rodada (`qa-reports/E2E-CONSOLIDATED-VEREDITO.md`) terminou com NO-GO; o Prompt 1 corrigiu os 13 P0 + 21 P1. Agora vamos validar **interações reais cross-role**, com 2 a 4 simuladores rodando em paralelo, observando como uma ação num device propaga pra outro via WS+API+IA.

**O que isso vai pegar (que a primeira rodada não pegou):**
- Latência real de WS event delivery cross-role
- Race conditions em escalation chains (late-arrival, table-merge)
- Drift de estado entre simulators (ex: customer A vê uma coisa, manager B vê outra)
- Bugs que só aparecem quando 2 humanos interagem com a mesma sessão de mesa
- Validações da spec que dependem de ver os dois lados (typewriter, chip-action, ManagerBubble)

---

### Princípios que TODOS subagentes seguem

1. **Cada subagent opera 2-4 simuladores OU mistura sims iOS + Playwright web.** Sempre 2+ devices simultâneos. Single-device test não é cross-validation.

2. **Sequência: Ação A → Observação B → Validação DB.** Nunca confiar só no que aparece na UI. Sempre conferir Postgres + Redis + Mongo + WS log. Tools úteis:
   - `docker exec restaurant-postgres psql -U postgres -d restaurant_dev -c "..."`
   - `docker exec restaurant-redis redis-cli LRANGE ack:queue 0 -1`
   - `docker exec restaurant-mongo mongosh restaurant_chat --eval 'db.chat_messages.find().limit(5).pretty()'`
   - `curl -s http://localhost:3001/api/restaurant_dev/...`

3. **Spec é contrato.** Antes de validar, lê o spec relevante:
   - `docs/features/customer-host-model.md`
   - `docs/features/chat-history-lgpd.md`
   - `docs/features/complaint-flow-v12.md`
   - `docs/features/vip-customer.md`
   - `docs/features/zone-pause.md`

4. **Latency budget**: WS event ≤ 2s end-to-end. Se passar, é bug.

5. **Reports**: cada subagent salva em `qa-reports/e2e-cross-{LETRA}-{nome}.md` com:
   - Cenário (1 parágrafo)
   - Setup (sims usados, papéis)
   - Sequência observada (passo a passo, com timestamp e device)
   - Validação DB/WS (queries usadas, output esperado/recebido)
   - Bugs encontrados (severidade, repro, evidência)
   - Screenshots críticos no `qa-reports/screenshots/`

6. **No fim**, consolidar em `qa-reports/E2E-CROSS-VEREDITO.md` com:
   - GO/NO-GO
   - Bugs novos vs bugs persistentes da rodada anterior
   - Latency stats agregados
   - Recomendação de próximos passos

---

### Subagent A — Reclamação ponta-a-ponta (customer → manager → customer)

> Sims: 2. Customer iOS Safari + Manager Playwright web (ou 2º sim).

Cenário V12 do spec `docs/features/complaint-flow-v12.md`.

Sequência:
1. **Sim 1 (customer)**: scan QR mesa → identify "Pedro" → home → "abrir cardápio" → IA renderiza menu → "1 risoto cogumelos" → IA dispara `add_to_order` → confirma.
2. **Sim 2 (waiter Caleb logado em /waiter)**: marca pedido como `delivered` (ou simula via API: `PATCH /orders/:id/status delivered`).
3. **Sim 1 (customer)**: 13 min depois (forçar via tweak no `cron-tick` ou `RPC` direto) → recebe push de avaliação → vai pra `/orders/:id/rating` → 2 estrelas → tap "tive um problema" → ScreenCustomerComplaintCompose → tap chip "Veio frio" → digita "estava completamente gelado" no ContextualInputExpand → enviar.
4. **Sim 2 (manager `/manager`)**: validar dentro de 2s aparece `MInProgressCard` kind=`complaint` em "Em curso". Tap → ScreenCallDetail kind=complaint → 4 quick replies presentes → tap "Vamos resolver".
5. **Sim 1 (customer)**: dentro de 2s ver `ManagerBubble` aparecendo no chat com chip-action "Aceitar" / "Recusar".
6. **Sim 1**: tap "Aceitar" → bubble atualiza pra "resolvido".

Validações DB:
- `complaints` row: `status='resolved'`, `assigned_manager_id` setado.
- `assistant_messages` últimas 5 do thread: contém role=manager bubble.
- WS log (`docker logs restaurant-api | grep complaint`): `complaint.created` → `complaint.responded` → `complaint.resolved` em < 5s.

Bugs a procurar:
- ManagerBubble aparece sem chip-action (regressão)
- chip-action volta depois de tap (deveria sumir após escolha)
- Manager Vê dois cards do mesmo complaint
- WS event chega no manager mas não chega de volta no customer

PR de findings: `qa-reports/e2e-cross-A-complaint.md`.

---

### Subagent B — Late-arrival (customer-host model)

> Sims: 2. Customer A iOS sim 1 + Customer B iOS sim 2.

Spec: `docs/features/customer-host-model.md` (seção late-arrival).

Sequência:
1. **Sim 1 (Customer A)**: scan QR mesa 5 → identify "Ana, CPF 11144477735" → home. Vira host (primeiro a escanear).
2. **Sim 2 (Customer B)**: scan QR mesma mesa 5 → IdentifyBeforeJoin obriga "Bruno, CPF 22255588801" → submit.
3. **Sim 1**: dentro de 2s recebe push approval. Abre ScreenManagerArrive (na verdade é overlay customer-host) — ver typewriter `cTypewriter` 25ms/char + border-left mostarda. Conteúdo: "Bruno chegou na mesa".
4. **Sim 1**: tap chip "Aceitar" (ou texto livre paralelo: "pode entrar").
5. **Sim 2**: dentro de 2s sai de waiting-approval pra home.
6. Validar `participants` no `/api/restaurant_dev/sessions/:id`: 2 entries, A `is_host=true` `status=approved`, B `is_host=false` `status=approved`.
7. **Sim 2**: cliente B já identificado anterior (CPF 22255588801) — fazer `clearSession` e re-scanear → auto-login (sem IdentifyBeforeJoin) → host A vê só nome (sem CPF).

Bugs a procurar:
- Typewriter renderiza tudo de uma vez (animação broken)
- chip-action duplicado depois de tap
- Auto-login recognizando CPF mas pedindo de novo
- Cooldown disparando errado (não deve haver cooldown em late-arrival, só em merge)
- `is_host` ficando true em B
- Race condition: B aprovando antes de A receber notificação

PR de findings: `qa-reports/e2e-cross-B-late-arrival.md`.

---

### Subagent C — Table merge (customer-host)

> Sims: 3. Host de M14 (sim 1) + Host de M15 (sim 2) + Manager (sim 3 ou Playwright web).

Spec: `docs/features/customer-host-model.md` (seção table-merge) + `merged-tile V3` no Mapa.

Sequência:
1. **Sim 1 (M14 host)**: na home → "quero juntar com a mesa do lado" → IA dispara `request_table_merge` sem target → abre `OverlaySalonMap` mostrando mesas vizinhas.
2. **Sim 1**: tap mesa 15 no overlay → escalation_chain criado.
3. **Sim 2 (M15 host)**: dentro de 2s recebe overlay com typewriter "M14 quer juntar mesas" → tap chip "Aceitar".
4. Validar: ambas mesas marcadas como merged. `merged-tile V3` aparece no mapa.
5. **Sim 3 (manager)**: vê `MInProgressCard` info-table-merge em /manager.
6. **Cooldown test (caminho A→B já recusado)**: clearSession Sim 2 → repete sequência mas Sim 2 recusa. Esperado: Sim 1 não pode pedir M15 por 20 min. Tenta de novo: deve receber resposta "tente outra mesa".
7. **Cooldown unidirecional**: Sim 2 (M15) AGORA pede M14 — deve **funcionar** (caminho reverso aberto, spec linha "respeita mudança de ideia"). Validar com query no `merge_cooldowns`.
8. **Staff override**: Sim 3 (manager) abre ScreenManagerTableMenu — força merge bypassing cooldown. Validar que escalation_chain criado tem origem=staff_override.

Validações DB:
```sql
SELECT * FROM table_merge_requests ORDER BY created_at DESC LIMIT 5;
SELECT * FROM merge_cooldowns ORDER BY created_at DESC LIMIT 5;
SELECT * FROM escalation_chains WHERE type='table_merge' ORDER BY created_at DESC LIMIT 5;
```

Bugs a procurar:
- Cooldown bidirecional (P0 — viola spec)
- merged-tile V3 não renderiza
- Staff override não respeitando flag
- typewriter cortando no meio quando WS chega segundo evento

PR de findings: `qa-reports/e2e-cross-C-table-merge.md`.

---

### Subagent D — KDS pipeline + waiter notify

> Sims: 4. Customer (sim 1) + Cozinha display web (Playwright) + Waiter sim 3 + Manager sim 4 (ou Playwright).

Sequência:
1. **Sim 1 (customer)**: home → "1 risoto cogumelos" → confirma.
2. **Cozinha (Playwright /cozinha)**: validar pedido aparece em coluna NOVOS dentro de 5s (polling 5s). Som beep dispara.
3. **Cozinha**: tap "Confirmar" → coluna PREPARANDO. Tap "Pronto!" → coluna PRONTOS.
4. **Sim 3 (waiter)**: dentro de 2s push notification "pedido pronto mesa X" — capturar com sim_statusbar/screenshot.
5. **Sim 3 (waiter)**: abre ScreenWaiterDeliveryConfirm → tap "Entreguei". Pedido vira `delivered`.
6. **Sim 4 (manager)**: durante todo flow, monitora "Em curso" — `kitchen-reorder` info card NÃO deve aparecer (pedido normal). Se houver, é bug.
7. **Sim 1 (customer)**: dentro de 5s vê chip "Pedido entregue · pode avaliar daqui a pouco".

Validações DB:
- `orders` row passa por `received → in_progress → ready → delivered`. `status_history` populado com timestamps.
- `notifications` (ou Redis pubsub) tem entries pra waiter.
- KDS som: capturar audio do Playwright se possível (ou validar que `playBeep()` foi chamado via console).

Bugs a procurar:
- Polling 5s atrasa update → drift até 5s entre cozinha e customer
- KDS som dispara em pedido modificado (deveria ser só novos)
- Waiter push duplicado (1 cozinha → 2 pushes)
- Status `delivered` chega no customer antes do waiter confirmar (race)

PR de findings: `qa-reports/e2e-cross-D-kds-pipeline.md`.

---

### Subagent E — VIP + Zone-pause cruzados

> Sims: 3. Manager (sim 1 ou web) + Waiter Caleb (sim 2) + Customer mesa 7 (sim 3).

Specs: `docs/features/vip-customer.md` + `docs/features/zone-pause.md`.

Sequência VIP:
1. **Sim 1 (manager)**: abre Mapa → mesa 7 → MoreSheet → tap "Marcar VIP".
2. Validar: `table_sessions.flags` agora contém `'vip'` (session-scoped, não `customers.is_vip`).
3. **Sim 3 (customer mesa 7)**: chama garçom via IA (`call_waiter`).
4. **Sim 2 (waiter)**: dentro de 2s recebe chamado COM badge VIP no card. Validar `priorityOf()` retornou `'high'`.
5. **Sim 1 (manager)**: também vê o chamado com VIP badge.

Sequência Zone-pause (continuação):
6. **Sim 1 (manager)**: pausa zona Caleb 5 min via MQuickActionsBar → modal seleciona Caleb + duração 5m.
7. **Sim 2 (waiter Caleb)**: dentro de 2s vê banner amarelo "ZONA PAUSADA · até HH:MM".
8. **Sim 3 (customer mesa 7)**: faz pedido novo. Esperado: ETA inflado silenciosamente (não mostrar "pausado").
9. **DB validation**: `zone_pauses` tem entry com `waiter_id=Caleb`, NOT zone-wide.
10. **Sim 1 (manager)**: pode encerrar antes via DELETE. `Sim 2`: banner some.
11. **Sim 1 (manager)**: pausa expira sozinho aos 5 min via cron tick. Sim 2: banner some sozinho. Validar `zone_pauses.active=false`.

Bugs a procurar:
- VIP virando permanente (`customers.is_vip` setado — viola spec F1)
- Zone-pause aplicando zone-wide (todos garçons recebem banner)
- Customer ver mensagem de "pausa" (deveria ser silencioso)
- ETA não inflando no pedido durante pausa
- Cron tick não derrubando pausa expirada

PR de findings: `qa-reports/e2e-cross-E-vip-zone-pause.md`.

---

### Subagent F — LGPD + chat-history (customer self-service)

> Sims: 1 (customer iOS). É o único caso single-device porque é fluxo só do customer.

Spec: `docs/features/chat-history-lgpd.md`.

Sequência:
1. **Customer**: identify "Maria, CPF 33399922200" → 5 turns conversando com IA (mix de tools: `recommend_dish`, `add_to_order`, `view_menu`, `ask_about_restaurant`, `view_order`).
2. Abre MenuDrawer → tap "Histórico de chats" → vê thread atual.
3. Volta home → digita "quero apagar uma conversa específica".
4. IA dispara `delete_chat(thread_id)` → 2 chips "Apagar / Cancelar".
5. Tap "Apagar" → success → chips somem (não devem reaparecer espontaneamente).
6. Validar Mongo: `db.chat_messages.find({customer_id:...,thread_id:...})` retorna 0 docs.
7. Volta MenuDrawer → digita "quero apagar TODAS as conversas".
8. IA dispara `delete_all_chats()` → chips Sim/Não.
9. Tap "Sim" → success → chips somem definitivamente.
10. Validar Mongo: 0 docs do customer. Validar Postgres: `customers` row de Maria intacto.
11. Repete o trigger LGPD canônico: digita "quero apagar meus dados".
12. IA dispara `show_lgpd_notice` → renderiza payload **literal** de `services/ai-service/services/lgpd_messages.py` (sem hallucination).
13. Validar byte-equal: `python -c "from services.lgpd_messages import LGPD_NOTICE; print(LGPD_NOTICE)"` deve bater com a string que apareceu na bubble.
14. Tap chip "Sim quero excluir" → `lgpd_data_request(type='erasure')` → success.
15. Mongo: 0 docs (já estava). Postgres: `lgpd_requests.status='fulfilled'` com protocolo. `customers` Maria **intacto** (não over-disclosure).
16. UI **NÃO** menciona "cadastro preservado" — verificar.

Bugs a procurar:
- Chips Sim/Não reaparecem após sucesso (regressão)
- IA hallucinou texto LGPD (não veio do canonical)
- Mongo TTL não rodando (docs antigos não sumindo)
- Customer Postgres apagado por engano
- UI mencionando cadastro

PR de findings: `qa-reports/e2e-cross-F-lgpd.md`.

---

### Subagent G — Bug-hunt segunda leva (cenários NÃO cobertos antes)

> Sims: variável. Pega "ângulos cegos" da rodada anterior.

Não testar de novo o que A-F já cobrem. Foco em:

1. **Recovery flows / failure modes**:
   - Customer perde wifi no meio de conversa IA → reconnect → estado preservado?
   - Manager logout no meio de complaint open → quem assume?
   - WS reconnect: durante zone-pause ativa, manager mata aba e abre de novo → banner persiste?
   - LM Studio offline → IA service degrada como? 503? Mensagem clara?

2. **Concurrent same-resource**:
   - 2 managers tentam responder o mesmo complaint simultaneamente — quem ganha?
   - Customer A pede merge com mesa 5 + customer B simultaneamente pede merge com mesa A → race?
   - 2 garçons tentam confirmar mesma entrega ao mesmo tempo.

3. **Edge inputs**:
   - Customer digita 2000 chars no ContextualInputExpand de complaint → trunca? Erro?
   - Customer envia 50 mensagens em 30s → rate limit? Comportamento da IA?
   - Customer com nome contendo emoji 🌮 — quebra alguma persistência?
   - CPF inválido (sem dígito verificador) — bloqueio na entrada?

4. **Data retention / time-based**:
   - Pedido `delivered` há 1h → push de avaliação NÃO repete.
   - Mongo TTL: docs > 30 dias somem (validar via `db.chat_messages.find({createdAt:{$lt:...}})`)
   - Cron jobs (10s tick): late-arrival timeout 5min, zone-pause expiry, merge cooldown 20min — todos disparam?

5. **Push notifications staff**:
   - 9 lockscreens descritos no handoff (`apps/web-staff/src/components/push/`) — cada um aparece corretamente?
   - Push agrupa quando múltiplos eventos chegam em < 5s?

6. **Tela "Eu" novas (recém-criadas, commit 518704c)**:
   - Manager `/manager/configuracoes` — botão "Sair" funciona, redireciona pra `/`?
   - Waiter `/waiter/eu` — KPIs renderizam (mesmo se 0)?
   - Cozinha `/cozinha/eu` — botão User no header da KDS leva pra cá?
   - Customer `/[slug]/eu` sem `customerId` — redireciona pra `/identify`? (P0 #13 fix)
   - Customer `/[slug]/eu` com `customerId` — botão "Apagar minhas conversas" pre-fills assistente corretamente?

PR de findings: `qa-reports/e2e-cross-G-edge-cases.md`.

---

## Coordenação final

Após todos subagentes terminarem:

1. **Consolidar** em `qa-reports/E2E-CROSS-VEREDITO.md`:
   - Veredito GO/NO-GO
   - Bugs novos por severidade
   - Bugs persistentes (não corrigidos pelo Prompt 1)
   - Latency stats agregados (média, p95)
   - Sugestão de próxima ação

2. **Comparar** com `qa-reports/E2E-CONSOLIDATED-VEREDITO.md` da rodada 1:
   - Quantos P0/P1 foram realmente fechados?
   - Algum reaberto?
   - Cobertura nova ganha?

3. **Reportar pra mim** em < 400 palavras: TL;DR + tabela de bugs novos + recomendação.

**Pra cada bug novo encontrado, criar issue Github** com label `e2e-cross-round2` + severidade. Não mergear nada — só report.
