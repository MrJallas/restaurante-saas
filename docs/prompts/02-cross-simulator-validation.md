# Prompt 2 · Validação cross-simulator · Jornada completa + bug-hunt

> **Versão**: v3.0 (2026-05-09 · pós round 3 fixes do Cat 1-15).
> **Como usar:** rodar **DEPOIS** que o Prompt 1 mergou os 6 PRs de fix
> *e* o PR consolidado da round 3 (este). Pré-condição absoluta: stack
> inteira viva e estável. Cola num chat novo de Claude Code dentro do
> repo. O orquestrador dispara **18 subagentes** (14 originais A-N + 4
> novos O/P/Q/R) em paralelo via Agent tool (`run_in_background=true`),
> cada um operando 1-4 simuladores ao mesmo tempo via xcodebuildmcp +
> Playwright + queries DB.

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
docker exec restaurant-redis redis-cli ping   # PONG

# 2. LM Studio
curl -s http://127.0.0.1:1234/v1/models | grep qwen   # qwen2.5-7b-instruct-mlx

# 3. Apps
curl -i http://localhost:3001/api/health        # API NestJS
curl -i http://localhost:3002                   # web-staff
curl -i http://localhost:3003                   # web-customer
curl -i http://127.0.0.1:8000/health            # ai-service

# 4. CORS sanity (Subagent 1 do Prompt 1 mergou?)
curl -i -X OPTIONS http://localhost:3001/api/restaurant_dev/zone-pauses \
  -H "Origin: http://localhost:3002" -H "Access-Control-Request-Method: GET" \
  | grep -i "access-control-allow-origin"   # deve mostrar :3002

# 5. Sims iOS prontos (≥ 4 booted)
xcrun simctl list devices booted | head -10

# 6. Tools registry
curl -s http://127.0.0.1:8000/health | grep tools_registered   # deve ser 23+

# 7. Seed data
docker exec restaurant-postgres psql -U postgres -d restaurant_dev \
  -c "SELECT COUNT(*) FROM tables WHERE tenant_slug='restaurant_dev';"   # ≥ 12
docker exec restaurant-postgres psql -U postgres -d restaurant_dev \
  -c "SELECT COUNT(*) FROM dishes WHERE tenant_slug='restaurant_dev';"   # ≥ 20

# 8. Pipeline LLM→tools end-to-end smoke (round 3 v3.0)
# Valida fix do Cat 1: API_BASE_URL setado, normalize hoist chips,
# contextual_chips persistido, FE ready pra renderizar.
PG_T() { docker exec restaurant-postgres psql -U postgres -d restaurant_saas \
         -t -A -c "$1" 2>/dev/null; }
PEDRO_ID=$(PG_T "SELECT id FROM restaurant_dev.customers WHERE cpf='55588811194'")
M05_ID=$(PG_T "SELECT id FROM restaurant_dev.tables WHERE code='M05'")
PG_T "UPDATE restaurant_dev.table_sessions SET status='closed' WHERE table_id='$M05_ID' AND status IN ('open','active')" > /dev/null
SECRET=$(PG_T "SELECT qr_hmac_secret FROM restaurant_dev.tables WHERE code='M05'")
TS_MS=$(python3 -c 'import time; print(int(time.time() * 1000))')
SIG=$(printf "M05:%s" "$TS_MS" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)
INIT=$(curl -s -X POST "http://localhost:3001/api/restaurant_dev/session/init" \
  -H "Content-Type: application/json" -c /tmp/p.txt \
  -d "{\"tableCode\":\"M05\",\"timestamp\":\"$TS_MS\",\"hmacSignature\":\"$SIG\"}")
SESSION_ID=$(echo "$INIT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessionId',''))")
curl -s -X POST "http://localhost:3001/api/restaurant_dev/customer/welcome" \
  -H "Content-Type: application/json" -b /tmp/p.txt -c /tmp/p.txt \
  -d '{"name":"Pedro","cpf":"55588811194"}' > /dev/null
sleep 1
RESP=$(curl -s -X POST "http://localhost:3001/api/restaurant_dev/assistant/message" \
  -H "Content-Type: application/json" -b /tmp/p.txt --max-time 60 \
  -d "{\"message\":\"mostra o cardapio\",\"customerId\":\"$PEDRO_ID\"}")
echo "$RESP" | python3 -c "
import json,sys
r=json.load(sys.stdin)
tc=r.get('toolCalls',[])
print('tools_dispatched:', len(tc))
print('first_tool:', tc[0].get('name') if tc else None)
print('chips_count:', len(tc[0].get('chips',[])) if tc else 0)
print('chips_in_response:', len(r.get('chips') or []))
"
# Esperado:
#   tools_dispatched: ≥ 1
#   first_tool: view_menu
#   chips_count: ≥ 1   (hoisted no normalizeToolCalls)
#   chips_in_response: ≥ 1   (aggregateChipsFromTools)
PG_T "SELECT contextual_chips IS NOT NULL FROM restaurant_dev.assistant_messages \
      WHERE customer_id='$PEDRO_ID' ORDER BY created_at DESC LIMIT 1"
# Esperado: t (true)
```

Se algum dos 3 esperados acima falhar (em particular tools_dispatched=0
ou contextual_chips=NULL), **PARA** — Cat 1 não foi fixado de verdade
neste deploy. Conferir:
- `docker exec restaurant-ai env | grep API_BASE_URL` (deve mostrar `http://api:3001/api/restaurant_dev`)
- `docker logs restaurant-ai --tail 50 | grep tool_calls`
- `apps/api/src/modules/assistant/assistant.service.ts:normalizeToolCalls`
  hoisted `chips` field

Se algum check falhar, **PARA** e me avisa.

---

## Princípios universais (todos subagentes seguem)

1. **Multi-device sempre que possível.** Cross-validation = 2+ devices observando o mesmo evento. Se for single-device (ex: tools customer-only), validar com query DB direta no fim.

2. **Sequência: Ação A → Observação B → Validação DB.** UI mente, DB não. Sempre conferir Postgres + Redis + Mongo + WS log no fim de cada passo.
   ```bash
   # Postgres
   docker exec restaurant-postgres psql -U postgres -d restaurant_dev -c "..."
   # Redis (ack queue, presence, sockets)
   docker exec restaurant-redis redis-cli LRANGE ack:queue 0 -1
   docker exec restaurant-redis redis-cli KEYS 'socket:*'
   # Mongo (chat persistence)
   docker exec restaurant-mongo mongosh restaurant_chat --eval 'db.chat_messages.find({customer_id:"..."}).pretty()'
   # API logs
   docker logs restaurant-api --tail 100 | grep -i "complaint\|merge\|pause"
   # WS event flow (server-side)
   docker logs restaurant-api --tail 200 | grep "EventsGateway"
   ```

3. **Spec é contrato.** Antes de validar, lê o spec relevante:
   - `docs/features/customer-host-model.md` (host privilege, late-arrival, table-merge)
   - `docs/features/chat-history-lgpd.md` (Mongo persist, LGPD canonical)
   - `docs/features/complaint-flow-v12.md` (rating → complaint → ManagerBubble)
   - `docs/features/vip-customer.md` (session-scoped flags)
   - `docs/features/zone-pause.md` (waiter-specific, ETA silencioso)

4. **Latency budget**:
   - WS event ≤ 2s end-to-end
   - LLM tool dispatch ≤ 4s (LM Studio local)
   - Polling fallback ≤ 8s
   - Push notification staff ≤ 5s

5. **Contextualização da IA é validação central** (subagentes A, B, C, K).
   A IA deve LEMBRAR o histórico. Se passou 5 turnos sem mencionar "risoto"
   mas o customer pediu "1 risoto" no turn 1, a próxima resposta DEVE poder
   referenciar ("já vi que você gostou do risoto…"). Falha disso é P1.

6. **Reports**: cada subagent salva em `qa-reports/e2e-cross-{LETRA}-{nome}.md` com:
   - Cenário (1 parágrafo)
   - Setup (sims usados, papéis, mesa, customer pré-cadastrado se houver)
   - Sequência observada (passo a passo, com timestamp e device, ≤ 30 passos)
   - Validação DB/WS (queries usadas, output esperado/recebido)
   - **Tools invocadas + tool_calls populados em assistant_messages** (lista)
   - **Chips contextuais observados após cada bubble** (lista)
   - Bugs encontrados (severidade P0/P1/P2, repro, evidência)
   - Screenshots críticos em `qa-reports/screenshots/{LETRA}/`

7. **Consolidar** no fim em `qa-reports/E2E-CROSS-VEREDITO.md`.

---

## Seed obrigatório antes dos subagentes (rodar no orquestrador)

```sql
-- Customers conhecidos (auto-login via CPF)
INSERT INTO customers (id, name, cpf, recognition_token, created_at)
VALUES
  (gen_random_uuid(), 'Ana Pereira',     '11144477735', 'tok_ana',     NOW()),
  (gen_random_uuid(), 'Bruno Pacheco',   '22255588801', 'tok_bruno',   NOW()),
  (gen_random_uuid(), 'Carla Mendes',    '33399922200', 'tok_carla',   NOW()),
  (gen_random_uuid(), 'Diego Vargas',    '44411155566', 'tok_diego',   NOW()),
  (gen_random_uuid(), 'Pedro Silva',     '55522266677', 'tok_pedro',   NOW())
ON CONFLICT (cpf) DO NOTHING;

-- Tabelas pré-liberadas (mock recepcionista até módulo host backend nascer)
UPDATE tables SET status='liberada' WHERE tenant_slug='restaurant_dev' AND number IN (5, 7, 14, 15, 22);
```

Customer "Eduardo" (CPF `66633377788`) **não** existe — pra testar fluxo de cadastro novo.

---

# JORNADA COMPLETA · Subagentes A-N

A jornada do customer (QR scan → checkout → LGPD) está fragmentada nos
subagentes A-D. Os outros (E-N) testam interações multi-papel + edge cases.

---

### Subagent A · Onboarding + Discovery (6 tools de descoberta)

> **Sims**: 1 (Customer iOS, Pedro CPF 55522266677 já cadastrado).
> **Tools cobertas**: `view_menu`, `search_dish`, `check_allergens`, `compare_dishes`, `recommend_dish`, `ask_about_restaurant`.

**Pré-condições**: Mesa 5 com `status='liberada'` (seed acima). Pedro existe em `customers`.

**Sequência (15 passos)**:

1. Customer escaneia QR mesa 5 (`/restaurant_dev/mesa/T05`).
2. WelcomeModal aparece — vê "Olá! Bem-vindo. Identifique-se" + campo nome.
3. Digita "Pedro" → campo CPF aparece → digita `55522266677`.
4. Auto-login: customer reconhecido. **Validar Postgres**:
   ```sql
   SELECT id, name, recognition_token FROM customers WHERE cpf='55522266677';
   SELECT customer_id, table_id, is_host, status FROM table_session_participants WHERE table_id=(SELECT id FROM tables WHERE number=5);
   ```
   Esperado: `is_host=true`, `status='approved'` (primeiro a escanear vira host).
5. Home renderiza com saudação personalizada "Olá Pedro" + chips iniciais. **Validar chips ≤ 4** e ≤ 22 chars cada. **Banidos**: "Ok", "Tá bom", "Sim" (puros).
6. Tap chip "Ver cardápio" OU digita "abrir cardápio". → IA dispara `view_menu` (silent — não bubble, abre overlay).
   - **Validar Postgres**: `SELECT tool_name FROM assistant_messages WHERE customer_id=... ORDER BY created_at DESC LIMIT 1;` → `view_menu`.
7. Fecha overlay. Digita "tem algum risoto?". → IA dispara `search_dish(query='risoto')`. Renderiza `linkedItems` como cards no chat.
   - **Validar bubble**: cards têm imagem, nome, preço, chip "Adicionar".
8. Digita "esse risoto de cogumelos tem lactose?". → IA dispara `check_allergens(dish_id='X', allergen='lactose')`. Resposta natural (sim/não + detalhes).
9. Digita "qual a diferença entre o risoto e o nhoque?". → IA dispara `compare_dishes(a='risoto', b='nhoque')`. UI side-by-side.
10. Digita "o que você recomenda pra hoje?". → IA dispara `recommend_dish(context='dinner')`. Sugestão com chip "Adicionar este".
    - **Contextualização test**: a recomendação deve **levar em conta** que ele perguntou de risoto/nhoque antes. Se sugerir "salada", é falha de contexto (P1).
11. Digita "até que horas vocês ficam abertos?". → IA dispara `ask_about_restaurant(topic='horários')`. Resposta direta SEM bubble "OK" intermediário (per spec).
12. Aguarda 30s. Vê chips reativos persistirem na última bubble (não somem).
13. **Contextualização cross-tool**: digita "vou querer aquele que você recomendou". A IA deve **lembrar** qual sugeriu no passo 10. Se pedir "qual?" → falha (P1).
14. **Validar Mongo**: chat thread tem todas as 6 tool calls em `assistant_messages.tool_calls`:
    ```bash
    docker exec restaurant-mongo mongosh restaurant_chat --eval \
      'db.chat_messages.find({customer_id:"..."}).count()'
    # Esperado: ≥ 12 docs (6 user + 6 assistant)
    ```
15. **Validar tool_calls populados** (não vazio):
    ```sql
    SELECT tool_name, COUNT(*) FROM assistant_messages
    WHERE customer_id='Pedro' AND tool_calls IS NOT NULL
    GROUP BY tool_name;
    -- Esperado: 6 rows (uma por tool)
    ```

**Bugs a procurar**:
- Customer com CPF conhecido pede CPF de novo (auto-login broken)
- WelcomeModal não bloqueia navegação (deve ser modal forçado)
- IA responde "Ok" intermediário em `ask_about_restaurant` (viola spec)
- Chips banidos aparecem ("Ok", "Sim")
- Recommend não tem chip "Adicionar este"
- Contextualização perdida entre passos 10 e 13

**Report**: `qa-reports/e2e-cross-A-onboarding-discovery.md`.

---

### Subagent B · Order lifecycle + KDS observation (4 tools de pedido)

> **Sims**: 2. Customer iOS (sim 1, Carla CPF 33366699957) + Cozinha Playwright web em `/cozinha`.
> **Tools cobertas (round 3 canon)**: `add_to_order`, `view_order`, `change_order` (era `modify_order_item`), `remove_from_cart` ou `cancel_order` (era `remove_order_item`).
> **Naming canon (atualizado 2026-05-09)**: spec antiga referenciava
> `modify_order_item` / `remove_order_item` — esses nomes não existem
> no registry. Use os canônicos: `change_order(itemId, qty)` e
> `remove_from_cart(itemId)` (ou `cancel_order` pra cancelar pedido inteiro).

**Pré-condições**: Mesa 7 liberada. Carla cadastrada.

**Sequência (20 passos)**:

1. Customer scan QR T07 → identify Carla → home.
2. Digita "1 risoto cogumelos". → IA dispara `add_to_order(item='risoto cogumelos', qty=1)`.
3. Bubble confirma "Adicionei 1 Risoto de cogumelos · R$ X,XX". Chips: "Ver pedido · Pedir mais · Pedir conta" (3 chips, ≤22 chars cada). **Validar**.
4. **Validar Postgres**:
   ```sql
   SELECT id, status, total_cents FROM orders WHERE customer_id='Carla' ORDER BY created_at DESC LIMIT 1;
   SELECT name, quantity, subtotal_cents FROM order_items WHERE order_id='X';
   ```
   Esperado: 1 order `status='received'`, 1 item.
5. **Cozinha Playwright** valida pedido aparece em coluna NOVOS dentro de 5s (polling). Card mostra `#OOOOOOOO`, item "1x Risoto de cogumelos", timer iniciado.
6. **Validar Redis pubsub**: `docker logs restaurant-api --tail 50 | grep order.created`.
7. Customer digita "adiciona um pão de alho também". → IA dispara `add_to_order(item='pão de alho', qty=1)`. Bubble confirma + chips.
8. **Cozinha**: card da mesa 7 atualiza → 2 items.
9. Customer digita "vê meu pedido". → `view_order` (silent — abre overlay /pedido OR renderiza cards).
10. Customer digita "muda o risoto pra 2 unidades". → `change_order(itemId='X', qty=2)`.
    - **Validar Postgres**: `order_items` row updated, `qty=2`, `subtotal_cents=2*X`.
    - **Validar tool name canon**: `assistant_messages.tool_calls[0].name='change_order'` (não `modify_order_item`).
11. **Cozinha**: vê "2x Risoto de cogumelos" (atualização ao vivo OR no polling 5s).
12. Customer digita "tira o pão de alho". → `remove_from_cart(itemId='Y')`.
    - **Validar Postgres**: row deleted OR `is_deleted=true`.
    - **Validar tool name canon**: `tool_calls[0].name='remove_from_cart'`.
13. **Cozinha**: card mostra só risoto.
14. **Cozinha**: tap "Confirmar" no card → status `received → preparing`. **Validar**:
    ```sql
    SELECT status, status_history FROM orders WHERE id='X';
    ```
    `status_history` tem entry `{from:'received', to:'preparing', changed_by:'cozinha', at:'...'}`.
15. **Cozinha**: tap "Pronto!" → status `preparing → ready`. Som beep dispara (validar via Playwright `console.log` ou stub).
16. **Aqui entra Subagent H** (KDS pipeline) — pra esse subagent B, parar em `ready`.
17. **Customer**: digita "como tá meu pedido?". → IA referencia status (`view_order` silent + bubble dizendo "tá pronto" OR "saindo da cozinha").
    - **Contextualização test**: IA sabe que pedido tá `ready`? Se disser "ainda preparando" mas DB mostra `ready`, é P1.
18. Customer digita "qual o total?". → IA responde com valor de `total_cents` formatado em BRL (R$ XX,XX).
19. **Validar Mongo chat persistence**: `docker exec restaurant-mongo mongosh restaurant_chat --eval 'db.chat_messages.find({customerId:"Carla"}).count()'` ≥ 14 docs. Field name agora é `customerId` (camelCase) — round 3 Cat 11 fix wira `chat_history.appendTurn` no AssistantService.
20. **Validar tool_calls**: `assistant_messages` tem 4 distintas: `add_to_order` (×2), `view_order`, `change_order`, `remove_from_cart`.
21. **Tool naming canon (round 3)** — após `add_to_order` ok, dispatch `change_order(itemId=X, qty=2)` (não `modify_order_item`!). Validar `tool_calls[0].name='change_order'`. Mesma coisa pra `remove_from_cart` (era `remove_order_item`).

**Bugs a procurar**:
- Cozinha não recebe modify (polling stale)
- `total_cents` desincroniza entre orders e order_items (regression de soma)
- Modify gera nova row em vez de UPDATE
- Remove deixa row órfã (sem `is_deleted` nem DELETE)
- IA não sabe estado atual do pedido (contextualização fail)
- Chips reactive depois de `add_to_order` faltam o "Pedir conta"

**Report**: `qa-reports/e2e-cross-B-order-lifecycle.md`.

---

### Subagent C · Communication tools (3 tools)

> **Sims**: 3. Customer (sim 1, Diego) + Waiter (sim 2, Caleb) + Manager (Playwright web).
> **Tools cobertas**: `call_waiter`, `send_message_to_manager`, `send_complaint`.

**Pré-condições**: Mesa 14 liberada. Diego cadastrado. Waiter Caleb logado em `/waiter`. Manager Renata em `/manager`.

**Sequência (18 passos)**:

1. Customer scan QR T14 → identify Diego → home.
2. Customer pede 1 prato (`add_to_order`) — necessário pra ter `delivered` depois pro complaint test.
3. Digita "preciso de mais água". → IA dispara `call_waiter(reason='mais água')`.
4. **Customer**: vê vaul sheet existente V4 abrindo (`/garcom/chamando`). Mensagem "Garçom a caminho".
5. **Validar Postgres**: `SELECT * FROM waiter_calls ORDER BY created_at DESC LIMIT 1;` → row com `reason='mais água'`, `status='pending'`.
6. **Waiter (sim 2)**: dentro de 2s vê chamado vermelho no topo do `/waiter` ("Mesa 14 chamou · agora"). Tap → ScreenCallDetail.
7. **Waiter**: tap "Atender" → status `pending → in_progress`. **Customer**: vaul sheet atualiza pra "Caleb a caminho" (WS event ≤ 2s).
8. **Waiter**: tap "Resolvido" → status `in_progress → resolved`. **Customer**: vaul sheet fecha + bubble nova "Caleb resolveu" + chips "Continuar pedido / Pagar conta".
9. **Manager**: durante todo flow não recebe nada (chamado é waiter-only, não escala).
10. Customer digita "o teto pingou um pouco no canto". → IA dispara `send_message_to_manager(text='...')`.
11. **Validar Postgres**: `SELECT * FROM staff_messages ORDER BY created_at DESC LIMIT 1;` → from=customer, to_role='manager'.
12. **Manager**: dentro de 2s vê notificação no topbar (badge incrementa). Abre `/manager/mensagens` → thread.
13. Customer (após pedido `delivered` por waiter manualmente OR via API): vai pra `/orders/:id/rating` → 2 estrelas → "tive um problema".
14. ScreenCustomerComplaintCompose abre. Tap chip tipo "Veio frio". ContextualInputExpand obriga texto livre — digita "estava completamente gelado".
15. Tap enviar. → IA dispara `send_complaint(text='...', problem_type='cold')`. **Validar requiresText: true** (sem texto deve bloquear envio).
16. **Manager**: dentro de 2s `MInProgressCard` kind=`complaint` aparece em "Em curso".
17. **Validar Postgres**: `SELECT * FROM complaints ORDER BY created_at DESC LIMIT 1;` → row criada, `assigned_manager_id IS NULL`.
18. Encerra subagent C (continuação no Subagent G).

**Bugs a procurar**:
- `call_waiter` cria row com waiter_id errado (não é o garçom da mesa)
- Vaul sheet não atualiza ao staff pegar (WS missing)
- `send_complaint` aceita texto vazio (bypass do requiresText)
- Manager recebe call_waiter (não deveria)
- staff_messages thread não persiste

**Report**: `qa-reports/e2e-cross-C-communication.md`.

---

### Subagent D · Payment 3 modes (5 tools)

> **Sims**: 2. Customer iOS (sim 1, Ana) + Customer iOS sim 2 (Bruno, depois entra na mesa).
> **Tools cobertas (round 3 canon)**: `request_check` (era `request_bill`), `pay_full`, `pay_individual`, `split_bill`, `open_payment_screen`.
> **Naming canon (atualizado 2026-05-09)**: spec antiga referenciava
> `request_bill` — o nome real no registry é `request_check`. Use o canônico.

**Pré-condições**: Mesa 22 liberada. Ana e Bruno cadastrados.

**Sequência (22 passos)**:

1. Ana (sim 1) scan QR T22 → identify → host. Pede 1 risoto.
2. Bruno (sim 2) scan QR T22 → IdentifyBeforeJoin (Subagent E cobre detalhes) → Ana aprova.
3. Bruno pede 1 nhoque.
4. **Validar Postgres**: `SELECT customer_id, SUM(total_cents) FROM orders WHERE table_session_id='X' GROUP BY customer_id;` → 2 rows.

**Pay-full path**:
5. Ana digita "quero pagar a conta inteira". → IA dispara `request_bill()`. Bubble com 2 opções: "Pagar pelo app · Chamar garçom".
6. Tap "Pagar pelo app". → IA dispara `pay_full(method=null)`. Navega `/pagamento?mode=full`.
7. Tela `/pagamento?mode=full` mostra total combinado (risoto + nhoque). Escolhe PIX. → `pay_full(method='pix')`.
8. PIX QR aparece. Stub paid (env flag) OR rodar mock provider.
9. **Validar Postgres**: `payments` row com `mode='full'`, `amount_cents = sum total`. `orders.payment_status = 'paid'`.

**Reset (Ana e Bruno re-entram em mesa diferente)**:
10. Reset DB pra mesa 7 (ou outra). Repete steps 1-3 com mesa 7.

**Pay-individual path**:
11. Ana digita "quero pagar só a minha parte". → `pay_individual(amount=null)`. Navega `/pagamento?mode=individual`.
12. Tela mostra só itens da Ana (risoto). Escolhe cartão.
13. **Validar Postgres**: `payments` row com `mode='individual'`, `amount_cents = risoto only`.
14. Bruno (sim 2): vê em sua UI que apenas Ana pagou. Digita "vou pagar a minha". → `pay_individual` → idem.

**Reset → mesa 14, Ana host, Bruno entra**:
15. Reset. Mesa 14.

**Split path**:
16. Ana digita "vamos dividir a conta". → `split_bill(method='even')` ou similar. Navega `/pagamento/dividir`.
17. Tela mostra split UI (50/50 ou per-person).
18. **Validar Postgres**: `payments` 2 rows com `mode='split'`, `split_share=0.5` cada.
19. **Customer-host privilege**: Bruno (não-host) tenta `split_bill` → IA bloqueia ou pergunta? Validar spec.
20. **Open payment screen como sub-tool**: customer fala "abre a tela de pagamento" → `open_payment_screen()` direto sem `request_bill`.
21. Validar todos 3 modes em `payments.mode` enum.
22. **Mongo**: chat tem todas as 5 tool calls registradas.

**Bugs a procurar**:
- `request_bill` router não diferencia "pelo app" vs "garçom" (cai no mesmo)
- Pay-full soma pedidos de mesas diferentes (cross-tenant leak)
- Pay-individual aceita pagar conta de outro customer
- Split divide qty incorreta com 3+ pessoas
- Bruno não-host consegue forçar `pay_full` (deveria ser bloqueado per spec?)
- `open_payment_screen` chamada direta sem prior `request_bill` quebra UI

**Report**: `qa-reports/e2e-cross-D-payment.md`.

---

### Subagent E · Late-arrival + customer-host approval

> **Sims**: 2. Customer A (Ana host de mesa 5) + Customer B (Eduardo CPF NOVO, não cadastrado).

Spec: `docs/features/customer-host-model.md`.

**Sequência (16 passos)**:

1. Ana (sim 1) scan QR T05 → identify (CPF conhecido) → host approved.
2. Bruno cadastrado já — pra contraste. Eduardo (CPF `66633377788`) **NÃO** existe.
3. Eduardo (sim 2) scan QR T05 → **IdentifyBeforeJoin** força nome+CPF (não pode pular).
4. Eduardo digita "Eduardo Vargas" + CPF `66633377788` → submit.
5. **Validar Postgres**: 
   ```sql
   INSERT into customers triggered? SELECT * FROM customers WHERE cpf='66633377788';
   SELECT customer_id, table_id, is_host, status FROM table_session_participants WHERE table_id=5 ORDER BY created_at DESC LIMIT 2;
   ```
   Esperado: Eduardo criado, `participants` 2 rows (Ana host approved, Eduardo non-host pending).
6. Eduardo vê tela `/waiting-approval` "Aguardando Ana aprovar".
7. **Ana (sim 1)**: dentro de 2s recebe overlay com **typewriter** `cTypewriter` 25ms/char + border-left mostarda. Conteúdo: "Eduardo quer entrar na mesa".
   - **Validar animação**: capturar 5 frames com 50ms de intervalo via screenshot. Char count crescendo, não tudo de uma vez.
8. Ana tem 3 chips: "Aceitar · Recusar · Ignora" OR similar (≤ 4, ≤22 chars).
9. Ana tap "Aceitar" — chip-action consumido (não reaparece após tap, per spec).
10. **Eduardo (sim 2)**: dentro de 2s sai de waiting → home. Saudação "Olá Eduardo".
11. **Validar Postgres**: Eduardo agora `status='approved'`, `is_host=false`.
12. **Auto-login test**: Bruno (cadastrado) entra em mesa diferente (mesa 7, recém-liberada). Ana (host de 7) recebe approval. **Validar**: typewriter mostra "Bruno quer entrar" — **sem** mostrar CPF.
13. Ana aprova Bruno. Bruno entra. **Validar Postgres**: Bruno NÃO criou customer novo (já existia).
14. **Race condition test**: 3º customer (Carla) escaneia mesa 7 enquanto Ana ainda está aprovando Bruno. Ana recebe 2º overlay empilhado OR um após outro.
15. **Privacy test**: Eduardo no histórico de chat de Ana — Eduardo NÃO deve ver mensagens privadas de Ana antes de entrar.
16. **Anonymous removal validation**: per spec "Spec atualizou de anonymous variant existe pra anonymous removido". Tentar entrar sem CPF (vazio) → API recusa 400.

**Bugs a procurar**:
- Typewriter renderiza tudo de uma vez (CSS animation broken)
- chip-action duplica em re-render
- Auto-login mostrando CPF do customer conhecido (over-disclosure)
- 3º customer rompe fila de approval
- Eduardo entra sem aprovação (cron timeout disparou? validar 5min)
- Late-arrival cria customer com CPF duplicado (constraint violation)

**Report**: `qa-reports/e2e-cross-E-late-arrival.md`.

---

### Subagent F · Table-merge bidirecional + cooldown + staff override

> **Sims**: 3. Host M14 (Ana) + Host M15 (Bruno) + Manager (Renata Playwright).

Spec: `docs/features/customer-host-model.md` seção table-merge.

**Sequência (20 passos)**:

1. Ana (sim 1) scan T14 → host. Bruno (sim 2) scan T15 → host.
2. Ana digita "quero juntar com a mesa do lado". → IA dispara `request_table_merge()` **sem target** → abre `OverlaySalonMap`.
3. Overlay mostra mesas vizinhas (T13, T15, T22). Tap T15.
4. **Validar Postgres**: 
   ```sql
   SELECT * FROM table_merge_requests ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM escalation_chains WHERE type='table_merge' LIMIT 1;
   ```
   Row criada `origin=T14, target=T15, status=pending, requested_by=Ana`.
5. **Bruno (sim 2)**: dentro de 2s recebe overlay com typewriter "M14 quer juntar mesas". Chips "Aceitar · Recusar".
6. Bruno tap "Recusar".
7. **Validar Postgres**: row updated `status=rejected`. `merge_cooldowns` row criada com `from_table=T14, to_table=T15, expires_at = now + 20min`.

**Cooldown unidirecional** (per spec):
8. Ana tenta de novo T15 (5s depois). IA responde "essa mesa não tá disponível agora, tente outra".
9. **Validar Postgres**: nenhuma nova row em `table_merge_requests`. Cooldown ativo.
10. **CAMINHO REVERSO**: Bruno (sim 2) digita "quero juntar com a M14". → `request_table_merge('T14')`. **Esperado**: ABRE pedido (cooldown só bloqueia A→B, não B→A — per spec linha "respeita mudança de ideia").
11. **Validar Postgres**: row criada `origin=T15, target=T14`.
12. Ana recebe typewriter. Tap "Aceitar".
13. **Mesas merged**: ambas marcadas merged. **Validar `merged-tile V3` no /manager Mapa**.
14. **Manager (Playwright)**: vê `MInProgressCard` info kind `info-table-merge`. NÃO há staff approval needed.
15. **Bills unificados**: Ana e Bruno (já mesma mesa) — pedidos somam.

**Staff override**:
16. Reset. Ana host T14, Bruno host T15. Bruno recusa. Cooldown ativo.
17. Manager Renata abre `/manager/operacoes` → MoreSheet sobre M14 → "Forçar merge com M15".
18. **Validar Postgres**: nova `escalation_chains` row com `origin=staff_override, requester_id=manager_id, bypassed_cooldown=true`.
19. Mesas merged sem chips no customer (manager forçou).
20. **Cooldown cleanup test**: cron 10s tick deve limpar `merge_cooldowns` rows expiradas. Aguardar 20min OR forçar `expires_at = now()` direto + tick. Validar limpeza.

**Bugs a procurar**:
- Cooldown bidirecional (P0 violation)
- merged-tile V3 não renderiza
- Staff override sem audit trail
- Bruno-recusa-A→B-mas-Ana-aceita-B→A NÃO funciona (caminho reverso bloqueado errado)
- Cron cleanup não funciona (rows ficam pra sempre)
- escalation_chain ficando órfão sem closure

**Report**: `qa-reports/e2e-cross-F-table-merge.md`.

---

### Subagent G · Complaint roundtrip · customer→manager→customer

> **Sims**: 2. Customer (Diego, continuando do Subagent C) + Manager Playwright.

Spec: `docs/features/complaint-flow-v12.md`.

**Sequência (16 passos)**:

1. Pré-condição: complaint criado no Subagent C step 17 (Diego, mesa 14).
2. **Manager (Playwright)**: `MInProgressCard` kind `complaint` em "Em curso". Tap.
3. **ScreenCallDetail type='complaint'** abre. Mostra: customer Diego, mesa 14, problema "Veio frio", texto "estava completamente gelado".
4. **Validar 4 quick replies presentes**: ex "Vamos resolver", "Cortesia oferecida", "Já a caminho", "Custom".
5. Manager tap "Vamos resolver" → `complaints/X/respond` POST.
6. **Validar Postgres**:
   ```sql
   SELECT status, manager_response, assigned_manager_id, responded_at FROM complaints WHERE id='X';
   ```
   `status=responded`, `assigned_manager_id` setado, `manager_response` preenchido.
7. **Customer (sim 1)**: dentro de 2s recebe `ManagerBubble` com **chip-action sub-card** (per spec V12).
8. ManagerBubble UI: bubble especial (border diferente) + chip-action interno "Aceitar resposta" + "Não resolveu".
9. Customer tap "Aceitar resposta" → `complaints/X/resolve` PATCH.
10. **Validar Postgres**: `status=resolved`. **Manager**: card some de "Em curso".
11. **Quick reply "Cortesia"** test (rerun): manager escolhe "Cortesia oferecida" → trigger `view_courtesy` flow.
    - Cortesia row em `courtesies` table. Customer vê CourtesyArrival overlay (silent tool dispatch).
12. **Custom reply** test: manager escolhe "Custom" → modal com textarea → digita resposta livre. → submitted como `manager_response`.
13. **Customer rejection path**: customer tap "Não resolveu" em ManagerBubble. **Validar**: `complaints.status=re_opened` ou similar. Manager recebe novo card.
14. **WS event sequence** (validar logs):
    ```
    complaint.created → complaint.responded → complaint.resolved (OR re_opened)
    ```
    Cada um < 5s end-to-end.
15. **Multiple managers race**: 2 managers em /manager. Manager A tap "Atender" no card. Manager B vê card cinza "atendido por Renata". B não pode responder.
16. **Validar Postgres**: `assigned_manager_id` lock (FOR UPDATE NOWAIT).

**Bugs a procurar**:
- ManagerBubble sem chip-action sub-card
- Chip-action duplicado após tap
- 4 quick replies aparecem em ordem diferente (consistência)
- Cortesia não dispara `view_courtesy` no customer
- Re_opened não cria nova row de event WS
- Race: 2 managers conseguem responder mesma complaint
- Custom reply aceita texto vazio

**Report**: `qa-reports/e2e-cross-G-complaint.md`.

---

### Subagent H · KDS pipeline + Waiter delivery + Push notification

> **Sims**: 4. Customer iOS + Cozinha Playwright + Waiter iOS + Manager Playwright.

**Sequência (18 passos)**:

1. Customer (Pedro, mesa 5) faz pedido `add_to_order` 1 risoto.
2. Cozinha vê em NOVOS dentro de 5s (polling). Som beep.
3. Cozinha tap "Confirmar" → PREPARANDO.
4. Cozinha tap "Pronto!" → PRONTOS + segundo beep.
5. **Waiter Caleb (sim 3)**: dentro de 5s recebe push notification "Pedido pronto · Mesa 5". Lockscreen aparece (capturar via xcodebuildmcp `screenshot`).
6. **Validar Redis**: `LRANGE notifications:queue 0 -1` tem entry pra Caleb.
7. Waiter tap notification → abre `/waiter/scan-qr/delivery-confirm?orderId=X`.
8. ScreenWaiterDeliveryConfirm mostra detalhes do pedido + botão "Entreguei".
9. Waiter tap "Entreguei". → `PATCH /orders/X/status delivered`.
10. **Validar Postgres**: `orders.status='delivered'`, `status_history` com timestamp.
11. **Customer (sim 1)**: dentro de 2s vê chip nova "Pedido entregue · pode avaliar daqui a pouco" + bubble.
12. **Manager (Playwright)**: durante todo flow, NÃO vê `kitchen-reorder` info card (só pedido normal). Se aparecer = bug.
13. **Wait 13min OR force `cron-tick` direct call** → push notification rating chega no Pedro.
14. Pedro tap → `/orders/X/rating` → 4 estrelas + comentário "delicioso, obrigado!" → tap enviar.
15. **Validar Postgres**: `order_ratings` row com rating=4, comment populado.
16. **Manager (Playwright)**: vê em `/manager` métricas atualizadas (avg rating, NPS).
17. **Som beep frequency test**: pedir 2º item enquanto cozinha tá com 5 items. Validar que beep só dispara em NOVOS, não em modify.
18. **Validar 9 push lockscreens** (`apps/web-staff/src/components/push/`): cada tipo tem template visual distinto. Capturar 1 de cada via simulator screenshot.

**Bugs a procurar**:
- Polling 5s atrasa update além do esperado
- Beep dispara em modify (não deveria)
- Waiter push duplicado (1 cozinha → 2 push)
- Status delivered chega no customer ANTES do waiter tap
- 13min push não dispara (cron broken)
- Rating < 3 não auto-redireciona pra complaint compose

**Report**: `qa-reports/e2e-cross-H-kds-pipeline.md`.

---

### Subagent I · VIP + Zone-pause + Allergy + Courtesy

> **Sims**: 3. Manager (Renata) + Waiter (Caleb) + Customer (mesa 7).

Specs: `docs/features/vip-customer.md` + `docs/features/zone-pause.md`.

**Sequência (22 passos)**:

**VIP path**:
1. Manager abre `/manager/operacoes` (ou Mapa). Mesa 7 ocupada por Pedro.
2. Tap mesa 7 → MoreSheet → "Marcar VIP".
3. **Validar Postgres**: `table_sessions.flags @> '["vip"]'::jsonb` (session-scoped). **NUNCA** `customers.is_vip=true`.
4. Customer Pedro chama garçom. → `call_waiter`.
5. **Waiter Caleb**: vê chamado COM badge VIP no card. **priorityOf** retornou `'high'`.
6. **Manager**: vê chamado com VIP badge no Mapa + Chamados. Ordenação prioriza.

**Allergy path**:
7. Manager flag mesa 7 com `'allergy'` (mesma sheet, opção diferente).
8. Pedro pede "1 risoto cogumelos". → `add_to_order` ok.
9. **Cozinha**: card mesa 7 mostra alerta vermelho "ALERGIA". Validar UI.
10. **priorityOf**: incluí `'allergy'` → `'high'`.

**Zone-pause path**:
11. Manager abre `/manager/pausa-zona` OR via MQuickActionsBar → "Pausar Zona".
12. Modal: seleciona Caleb (waiter) + duração 5min.
13. **Validar Postgres**: `zone_pauses` row com `waiter_id=Caleb_id, kind='orders', ends_at = now + 5min, active=true`.
14. **Waiter Caleb (sim 2)**: dentro de 2s vê banner amarelo "ZONA PAUSADA · até HH:MM" no top.
15. **Customer Pedro (mesa 7, atendida por Caleb)**: faz novo pedido. ETA inflado **silenciosamente** (não mostrar "pausado" — per spec).
16. **Outros waiters** (Olivia, Henrique): NÃO recebem banner.
17. **Customer mesa 22 (atendida por Olivia)**: faz pedido normal sem ETA inflado.
18. **Garçom manual override**: Caleb pode lançar pedido manual durante pausa (entra no congelador, não bloqueado).
19. **Cron expiry**: aguardar 5min OR forçar `ends_at=now()` + tick. Banner some sozinho. ETA volta normal.
20. **MOpSummary post-mortem**: aparece pro manager um summary card com "Pausa de Caleb · 5 min · 3 pedidos esperaram".

**Courtesy path**:
21. Manager tap mesa 7 → MoreSheet → "Cortesia".
22. **Customer Pedro**: dentro de 2s recebe overlay `CourtesyArrival` (silent tool `view_courtesy`). Bubble "Cortesia da casa".
   - **Validar Postgres**: `courtesies` row, `customer_id=Pedro_id, granted_by=manager_id`.

**Bugs a procurar**:
- VIP em `customers.is_vip` (permanente — viola F1 fix)
- Zone-pause aplicando zone-wide (Olivia/Henrique também recebem)
- Customer ver mensagem "pausado" (deveria ser silencioso)
- ETA não inflando
- Cron cleanup não derrubando
- priorityOf não considerando allergy
- Cozinha card sem alerta vermelho (visual missing)
- Cortesia não disparando overlay

**Report**: `qa-reports/e2e-cross-I-flags-and-priority.md`.

---

### Subagent J · LGPD + chat-history (5 tools de sessão/privacidade)

> **Sims**: 1 (Customer iOS, Carla). Single-device tool flow.

Spec: `docs/features/chat-history-lgpd.md`.

**Tools cobertas**: `view_chat_history`, `delete_chat`, `delete_all_chats`, `show_lgpd_notice`, `lgpd_data_request`.

**Sequência (24 passos)**:

1. Carla faz 5 turnos com IA (mix de tools nos subagentes A-D, replicar 5 turns).
2. Validar Mongo: `db.chat_messages.find({customer_id:Carla.id}).count()` ≥ 10.
3. **view_chat_history** silent: digita "ver meu histórico de chats". → `view_chat_history()`. **Validar tool_calls populated, navigate to `/chat-history`**.
4. ScreenCustomerChatHistory mostra threads agrupadas por mês.
5. **delete_chat (single)**: digita "quero apagar a conversa de hoje". → `delete_chat(thread_id='X')`. 2 chips "Apagar / Cancelar" (≤22 chars).
6. Tap "Apagar". → success. Chips somem. Bubble nova "Apagada".
7. **Validar Mongo**: `db.chat_messages.find({thread_id:'X'}).count()` = 0.
8. **delete_all_chats**: digita "apagar todas". → `delete_all_chats()`. 2 chips "Sim, apagar tudo / Não".
9. Tap "Sim". → success.
10. **Validar Mongo**: `db.chat_messages.find({customer_id:Carla.id}).count()` = 0.
11. **Validar UI**: chips somem **definitivamente**. Não reaparecem.
12. **Validar Postgres customers Carla intacto**: `SELECT * FROM customers WHERE id=Carla.id;` → row presente, name/cpf/recognition_token preservados.

**LGPD canonical path**:
13. Carla digita "quero apagar meus dados". → IA dispara `show_lgpd_notice()`.
14. Bubble renderiza **payload literal** de `services/ai-service/services/lgpd_messages.py` LGPD_NOTICE constante.
15. **Byte-equal validation**:
    ```bash
    python -c "from services.ai-service.services.lgpd_messages import LGPD_NOTICE; print(repr(LGPD_NOTICE))"
    # Compara com o que apareceu na bubble. byte-equal.
    ```
16. Bubble tem **2 chips binários**: "Sim quero excluir / Não, não quero excluir" (per spec).
17. Tap "Sim quero excluir". → IA dispara `lgpd_data_request(type='erasure')`.
18. **Validar Postgres**: `lgpd_requests` row com `type='erasure', status='fulfilled', protocol_number='LGPD-XXXXX', customer_id=Carla.id, fulfilled_at=now()`.
19. **Validar Mongo**: 0 docs Carla (já estava após step 9).
20. **Validar Postgres customers**: Carla **intacto** (não over-disclosure).
21. **UI validation**: bubble final NÃO menciona "cadastro preservado" (per spec — over-disclosure removido).
22. **Chips somem após sucesso** (regra de re-aparição). Validar que digitar mais frases NÃO ressuscita os chips.
23. **Mongo TTL test**: criar doc com `createdAt = now - 31days` direto. Esperar TTL 30 dias derrubar (pode forçar via Mongo command).
24. **`assistant_messages` validation**: `tool_calls` populados pra todas 5 tools (view_chat_history, delete_chat, delete_all_chats, show_lgpd_notice, lgpd_data_request).

**Bugs a procurar**:
- LGPD_NOTICE divergente do canonical (LLM hallucinated)
- Chips Sim/Não reaparecem após sucesso
- Mongo TTL não rodando (docs > 30 dias persistem)
- Postgres customers apagado por engano
- UI menciona "cadastro" quando não deveria
- delete_all não inclui mensagens de outros threads do mesmo customer
- Protocol number mal formado (regex check)
- `lgpd_requests` sem `customer_id` (anonymous record — viola spec)

**Report**: `qa-reports/e2e-cross-J-lgpd.md`.

---

### Subagent K · Contextualização IA + chip reactivity (transversal)

> **Sims**: 1 (Customer iOS qualquer). Foco em validar **memória da IA** e **reactive chips** ao longo de jornada longa (15+ turnos).

Esse subagent NÃO testa flows novos — testa qualidade da contextualização ao longo dos flows dos subagentes A-J. Roda em paralelo, faz log de cada bubble.

**Sequência (30 passos)**:

1. Customer (Pedro, mesa 5) entra na conversa.
2. Captura **TODOS** chips após cada bubble. Lista cada um (texto, ordem, tom).
3. Validações por tipo de tool:

| Tool invocada | Chips esperados após | Banidos |
|---|---|---|
| `view_menu` | "Risoto · Bebidas · Sobremesas" (categorias relevantes) | "Ok" |
| `search_dish` | "Adicionar este · Ver mais · Ingredientes" | "Sim" |
| `recommend_dish` | "Adicionar este · Outras opções" | nenhum ack puro |
| `add_to_order` | "Ver pedido · Pedir mais · Pedir conta" | "Tá bom" |
| `view_order` | "Pedir mais · Modificar · Pedir conta" | — |
| `call_waiter` | (poucos · não reabrir) "Cancelar chamado" | — |
| `delete_all_chats` | (NENHUM · regra de re-aparição) | TODOS |
| `show_lgpd_notice` | "Sim quero excluir · Não, não quero excluir" (binário) | qualquer terceiro |
| `pay_full` | "Confirmar PIX · Trocar pra cartão" | — |

4. **Memória de longa duração** (15 turns):
   - Turn 1: pede risoto.
   - Turn 5: pergunta "qual o total?". IA deve responder com valor real (≥ 1 item).
   - Turn 10: pede "vou querer mais um daquele que pedi". IA deve INFERIR risoto e adicionar (+1 qty OR novo item).
   - Turn 15: pergunta "qual a comparação entre o que comi e a sobremesa?". IA deve referenciar items do pedido + sobremesas do menu.

5. **Tom/estilo**: verificar IA NÃO usa:
   - Emojis (a menos que customer use primeiro)
   - "Olá!" no meio da conversa (só na primeira)
   - Repetição de "Posso ajudar com mais alguma coisa?" (deve variar)

6. **Animação `cBalloonPulse`** durante LLM thinking: bubble aparece pulsando, dotPulse visível. Validar via screenshot a cada 200ms.

7. **`liquidMorph` chip animation**: ao tap chip, transição smooth pra próxima resposta. Validar visualmente.

8. **ContextualInputExpand** trigger:
   - `send_complaint` → expand obrigatório (input cresce, hint "conte o que aconteceu...").
   - `send_message_to_manager` → expand obrigatório.
   - `add_to_order` → expand não-obrigatório.

9. **Tool dispatch latency**: tempo entre customer pressionar enviar e tool ser despachada. Esperado < 4s.

10. **Failure mode**: LM Studio offline (parar processo) → IA degrada como?
    - Bubble "estou com dificuldades, tenta de novo" (não exception genérica)
    - Não disparar tools com payload vazio
    - Recovery: ao voltar, retomar conversa do ponto.

**Report**: `qa-reports/e2e-cross-K-context-and-chips.md` com tabela completa das chips capturadas + análise de contextualização por turn.

---

### Subagent L · Push notifications staff (9 lockscreens)

> **Sims**: 4 (Manager + Waiter + Host + Cook).

**Lockscreens a validar** (`apps/web-staff/src/components/push/`):

1. `PushComplaint` — pra manager
2. `PushLateArrival` — pra manager (apenas pra info; staff não decide)
3. `PushTableMerge` — pra manager (info)
4. `PushZonePause` — pra manager (broadcast)
5. `PushCourtesy` — pra waiter (entrega)
6. `PushStaffMessage` — pra qualquer staff
7. `PushOrderReady` — pra waiter (entrega)
8. `PushLgpdFulfilled` — pra manager (audit log)
9. `PushQrIssue` — pra waiter primeiro, escala manager se sem resposta 4min

**Sequência (18 passos)**:

1. Setup: 4 sims com staff diferentes logados.
2. **Trigger 1**: customer manda complaint. → ManagerSim recebe `PushComplaint`. Capturar lockscreen via `xcodebuildmcp screenshot`.
3. **Trigger 2**: late-arrival pending. → ManagerSim `PushLateArrival`. Validar visual diferente (ícone, cor).
4. **Trigger 3**: merge pending. → ManagerSim `PushTableMerge`.
5. **Trigger 4**: zone-pause iniciada. → Todos managers + waiter alvo recebem `PushZonePause`.
6. **Trigger 5**: courtesy granted. → WaiterSim `PushCourtesy`.
7. **Trigger 6**: staff message. → Recipient `PushStaffMessage`.
8. **Trigger 7**: order ready. → WaiterSim `PushOrderReady`.
9. **Trigger 8**: LGPD fulfilled. → ManagerSim `PushLgpdFulfilled`.
10. **Trigger 9**: QR issue reported. → WaiterSim `PushQrIssue` primeiro.
11. **Escalation test (9)**: aguardar 4min sem ação. → escala pro 1º manager. Aguardar mais 4min → escala pro próximo manager. Aguardar mais → escala owner.
12. **Validar `escalation_chains`** populado:
    ```sql
    SELECT * FROM escalation_chains WHERE type='qr_issue' ORDER BY created_at DESC;
    ```
13. **Push grouping**: gerar 5 events em < 5s (5 complaints rápidos). Esperado: agrupados em 1 lockscreen "5 reclamações novas" OR 5 separadas? Validar com spec.
14. **Push tap behavior**: tap em PushComplaint → abre `/manager/chamado/X?kind=complaint`.
15. **Push deep-link**: tap em PushOrderReady → `/waiter/scan-qr/delivery-confirm?orderId=X`.
16. **Lockscreen consistency**: cada um tem ícone, título, sub, ETA opcional. Validar todos têm os 4 campos.
17. **Sem badge mismatch**: badge counter no app icon = soma de pushes pendentes.
18. **Idempotência**: re-disparar mesmo event 2× rápidos não duplica push.

**Bugs a procurar**:
- Push duplicado em 1 cozinha → 2 pushes
- Lockscreen com texto cortado (overflow)
- Push tap leva pra rota errada
- Escalation cron timer broken
- Badge counter desincronizado
- 9º lockscreen não existe (push silencioso)

**Report**: `qa-reports/e2e-cross-L-push-notifications.md`.

---

### Subagent M · Recovery / Failure / Concurrent / Edge inputs

> **Sims**: variável conforme cenário.

**Sub-cenários (cada um vira sub-section no report)**:

#### M.1 · Wifi loss / WS reconnect
1. Customer (sim 1) está em conversa.
2. Desabilita wifi do sim (xcodebuildmcp). Aguarda 30s.
3. Reabilita.
4. **Esperado**: IA reconecta WS, conversa retoma sem reload. Histórico preservado.
5. **Validar**: `socket.io-client` reconnect logs visíveis. Customer NÃO perde estado.

#### M.2 · LM Studio offline
1. Para processo LM Studio (`pkill -f lm-studio` ou similar).
2. Customer pede algo.
3. **Esperado**: ai-service retorna 503 OR fallback "estou com dificuldades, tenta em 1 min". NÃO crashea.
4. Reabre LM Studio. Tenta de novo. Funciona.

#### M.3 · 2 managers same complaint
1. Manager A e Manager B ambos em /manager.
2. Complaint cria → ambos veem card.
3. Manager A tap "Atender" + responde.
4. **Esperado**: Manager B vê card cinza "atendido por A". Não pode responder.
5. **Validar locks** em `complaints.assigned_manager_id`.

#### M.4 · 2 customers same merge target
1. Mesa 5 quer mergear com Mesa 14.
2. Mesa 22 quer mergear com Mesa 14 simultaneamente.
3. **Esperado**: Mesa 14 host recebe 2 overlays empilhados OR um após outro. Cada um tem decisão independente.
4. **Validar**: 2 rows em `table_merge_requests` distintas.

#### M.5 · 2 waiters same delivery
1. Waiter A tap "Entreguei" no order X.
2. Waiter B tap "Entreguei" no mesmo order X (race < 1s).
3. **Esperado**: 1 sucesso, 1 erro 409 "Already delivered".

#### M.6 · CPF inválido
1. Customer escaneia QR. WelcomeModal pede CPF.
2. Digita "12345678900" (sem dígito verificador correto).
3. **Esperado**: erro inline "CPF inválido". Não submete.

#### M.7 · Nome com emoji
1. Customer digita "🌮 Pedro 🍕". Submit.
2. **Esperado**: customer criado com emoji preservado (UTF-8). UI renderiza ok.
3. **OR**: validation rejeita emojis.

#### M.8 · 2000 chars no ContextualInputExpand
1. Customer abre complaint compose. ContextualInputExpand cresce.
2. Cola 2000 chars de lorem ipsum. Tap enviar.
3. **Esperado**: salva ok, ou trunca em 1000 com aviso. Não crashea.

#### M.9 · Rate limit (50 mensagens em 30s)
1. Script: customer envia 50 msg /chat em 30s.
2. **Esperado**: 429 Too Many Requests após N mensagens. Cooldown.

#### M.10 · Pedido com qty 0
1. Customer fala "adiciona 0 risotos". → IA dispara `add_to_order(qty=0)` OR rejeita.
2. **Esperado**: IA pergunta clarificação OR API valida `qty >= 1`.

#### M.11 · Prato esgotado
1. Manager marca dish como `is_available=false`.
2. Customer pede esse dish. → IA responde "infelizmente acabou, posso sugerir outro?".
3. **Validar**: `add_to_order` NÃO cria order.

#### M.12 · Manager logout mid-complaint
1. Manager A em ScreenCallDetail respondendo complaint.
2. Manager A logout abruptly.
3. **Esperado**: lock libera após N segundos, complaint volta a ficar disponível para outros managers.

**Report**: `qa-reports/e2e-cross-M-recovery-edge.md` com sub-section pra cada M.X.

---

### Subagent N · Telas "Eu" novas (commit 518704c) + UI smoke

> **Sims**: 4. Customer + Manager + Waiter + Cook.

**Validações por tela**:

#### N.1 · Manager `/manager/configuracoes`
1. Login como Renata. Bottom nav tap aba "Eu" (engrenagem).
2. **Esperado**: navega `/manager/configuracoes`. ScreenManagerProfile renderiza.
3. Avatar com iniciais "RA" + nome "Renata Albuquerque" + role "Gerente".
4. Card "Turno de hoje 17:00 — 23:00".
5. 2 stats cards (chamados resolvidos, reclamações tratadas).
6. 3 acessos (Mensagens, Notificações, Equipe).
7. Botão "Sair" → tap → redireciona `/`.
8. Validar bottom nav active="me" (engrenagem destacada).

#### N.2 · Waiter `/waiter/eu`
1. Login Caleb. Bottom nav tap "Eu" (4ª aba antes era /mensagens, agora /eu — Subagent 1 do Prompt 1 corrigiu).
2. **Esperado**: navega `/waiter/eu`. ScreenWaiterProfile renderiza.
3. Avatar 88×88 com initials "CS" + nome + "Garçom".
4. Turno + 3 stats (mesas, resposta avg, rating).
5. 2 acessos (Mensagens, Histórico do turno).
6. Sair button.

#### N.3 · Cozinha `/cozinha/eu`
1. Acessa `/cozinha`. Header tem botão User (top right, ao lado do som on/off).
2. Tap → navega `/cozinha/eu`.
3. Tela dark consistente com KDS. Avatar laranja + nome + "Cozinheiro".
4. Stats placeholders (—).
5. Voltar → tap header back → volta pra `/cozinha`.

#### N.4 · Customer `/{slug}/eu` COM customerId
1. Customer Pedro logado. MenuDrawer tem entry "Eu · Perfil e privacidade" (nova).
2. Tap → navega `/restaurant_dev/eu`.
3. Avatar com iniciais "PS" + nome + "Cliente · Conhecido da casa" (se isReturning=true).
4. Card "Sessão atual · Mesa 5 · 1 pessoas".
5. 3 acessos (Histórico de chats, Meus pedidos, Reclamações).
6. "Apagar minhas conversas" → tap → navega `/assistente?prefill=Quero apagar meus dados`.
7. "Trocar perfil" → `/{slug}` root.
8. "Sair da mesa" → sessionStorage clear + `/`.

#### N.5 · Customer `/{slug}/eu` SEM customerId (guard test)
1. Cliente NOVO sem customer cadastrado (usar incognito OR `sessionStorage.clear()`).
2. Acessa direto `/restaurant_dev/eu` (sem passar por identify).
3. **Esperado**: tela renderiza versão guard com CTA "Identificar agora" → tap → `/identify`.
4. **NÃO** mostra tela vazia "Faça login na próxima visita" (que era P0 #13).

#### N.6 · Manager `/manager/financeiro`
1. Bottom nav tap "Financeiro".
2. Tela "Em desenvolvimento" placeholder com 4 preview boxes.
3. Botão "Voltar ao Painel" → `/manager`.
4. Bottom nav active="finance".

#### N.7 · Smoke geral
1. **iOS Safari safe-area**: bottom nav não fica cortado por home indicator.
2. **Hamburger animation**: drawer abre/fecha smooth, sem flicker.
3. **Dark mode**: testar (se app suporta) — todas telas Eu legíveis.
4. **Deep-link**: refresh `/manager/configuracoes` direto não dá 404.
5. **Back button**: cada tela "Eu" → tap back → volta pra rota anterior correta.

**Bugs a procurar**:
- Tela Eu renderiza mas bottom nav fica out-of-sync (active errado)
- Customer guard não dispara (mostra tela vazia)
- Cozinha tela "Eu" Tailwind não bate com KDS (visual inconsistente)
- Logout não limpa staffRole/staffId (fica logado de fato)
- Avatar initials com 1 letra apenas (corner case "Pedro" sem sobrenome)
- iOS safe-area-inset-bottom faltando

**Report**: `qa-reports/e2e-cross-N-eu-screens.md`.

---

## Coordenação final

Após todos 14 subagentes terminarem:

1. **Consolidar** em `qa-reports/E2E-CROSS-VEREDITO.md`:
   - Veredito GO/NO-GO
   - Tabela de cobertura: 23 tools × subagent que cobriu
   - Tabela de jornadas: cada step da jornada completa × pass/fail
   - Bugs novos por severidade (P0/P1/P2)
   - Bugs persistentes (não corrigidos pelo Prompt 1 — viraram P0 reaberto)
   - Latency stats agregados (média, p95, p99)
   - Contextualização score (subagent K)
   - Push lockscreens score (9/9 funcionais? sub L)

2. **Comparar** com `qa-reports/E2E-CONSOLIDATED-VEREDITO.md` (rodada 1):
   - Quantos P0/P1 foram realmente fechados?
   - Algum reaberto?
   - Cobertura nova ganha (subagentes K, L, M, N são novos)

3. **Reportar pra mim** em < 600 palavras:
   - TL;DR (GO/NO-GO + número de bugs novos)
   - Top 3 bugs P0 novos
   - Score de contextualização IA (das 23 tools, quantas a IA referenciou histórico)
   - Latency stats agregados
   - Recomendação de próxima ação

4. **Pra cada bug novo P0/P1**, criar issue Github com label `e2e-cross-round2` + severidade. Não mergear nada — só report.

5. Sugerir próximos passos:
   - Rodar Prompt 1 v2 (fixes dos bugs novos) OR
   - Smoke manual final OR
   - Liberar pra deploy se zero P0.

---

## Cobertura final esperada

| Categoria | Subagent | Tools/scenarios |
|---|---|---|
| **Customer Solo** | A, B, C, D | 6 + 4 + 3 + 5 = 18 tools |
| **Cross-Role** | E, F, G, H | 5 (4 customer-host) + KDS pipeline |
| **System Flags** | I, J | VIP+pause+allergy+courtesy + 5 tools privacy |
| **Quality** | K | Contextualização + chips reativos transversal |
| **Infrastructure** | L | 9 push lockscreens |
| **Resilience** | M | 12 sub-cenários de edge/recovery |
| **Smoke** | N | 5 telas Eu novas + UI smoke |
| **Regression r3** | O | Re-validar 15 categorias do round 3 |
| **V20 chat** | P | Redesign customer chat + screenshots |
| **Continuation** | Q | 5 kinds × 2 segments (regular/vip) |
| **Dead code** | R | Confirmar limpeza dos componentes órfãos |

**Total: 23 tools cobertas + jornada completa (QR scan → LGPD) + 9 push lockscreens + 12 edge cases + 5 telas Eu + 4 subagents de regression r3.**

---

# REGRESSION SUITE · Subagentes O/P/Q/R (round 3 v3.0)

Após os subagentes A-N existentes, os 4 abaixo focam exclusivamente em
re-validar o que foi corrigido na round 3 (Cat 1-15 do prompt de fix).

---

### Subagent O · Regression suite (pós-fixes round 3)

> **Sims**: 1 (Customer iOS, Pedro CPF 55588811194 já cadastrado, Mesa M05).
> Re-validar TODOS os fixes Categoria 1-15 do prompt de fix.

**Casos de teste** (cada um precisa passar pra subagent passar):

| # | Categoria | Caso | Aceitação |
|---|---|---|---|
| O.1 | C1 (tool dispatch) | 5 mutações em sequência (`mostra menu`, `1 risoto`, `pode chamar garçom`, `quero pagar`, `apaga conversa`) | ≥ 4/5 com `tool_calls` populated |
| O.2 | C1 (chips) | mesma sessão acima | `assistant_messages.contextual_chips` not null em ≥ 4/5 turnos |
| O.3 | C2 (KDS) | criar order via API → ver em `/cozinha` | Aparece em < 5s, sem hard-refresh |
| O.4 | C4 (chat V20) | screenshots dos 4 estados (welcome novo / já-na-mesa / turn com chips / multi-step vinho) | Bate com `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx`: header com nome do host, eyebrow `··· USANDO X ···`, system join notice, placeholder contextual |
| O.5 | C5 (continuation) | abrir home pós (a) viu menu (b) chamou garçom (c) abriu pedido (d) pagou (e) voltou sem ação | 5 screenshots distintos com texto + chips canon retornados pelo `GET /continuation?kind=…` |
| O.6 | C6 (cooldown unidirecional) | A→B reject + cooldown ativo + B→A retry | A→B retry: 429. B→A: 201. (cooldown não bloqueia direção reversa) |
| O.7 | C7 (migration 035→036) | `\d+ table_merge_requests` no schema restaurant_dev | mostra colunas `approved_by_a_at` + `approved_by_b_at` |
| O.8 | C8 (staff override) | manager `POST /staff/table-merges/force` com mesa em cooldown | merge approved + `escalation_chains.steps` registra `kind=staff_override` |
| O.9 | C9 (classifier) | `qual o horário?` enviado por customer | classifier.allowed=true, was_blocked=false |
| O.10 | C10 (customer_id) | qualquer mensagem do chat customer com bundle | `assistant_messages.customer_id IS NOT NULL` |
| O.11 | C11 (mongo) | enviar 5 mensagens com customerId | `db.chat_messages.countDocuments({customerId})` ≥ 10 |
| O.12 | C12 (qty validation) | `1 risoto` → `add_to_order(qty=1, itemId=<UUID>)` | qty=1 + itemId é UUID v4 |
| O.13 | C13 (dead code) | `git diff --stat HEAD~..HEAD` | ContextualInputExpand.tsx + MergedTableTile.tsx removidos do tree |
| O.14a | C14 (cozinha overflow) | screenshot de `/cozinha` em viewport 430×932 | User-button visível dentro do viewport (header tem flex-wrap) |
| O.14b | C14 (bottom-nav name) | navegar `/manager?name=Caleb` → tap engrenagem | URL final tem `?name=Caleb` preserved |
| O.15 | C15 (pix leak) | `POST /payments {method:'card'}` | `pixQrCode === null` no response, `pix_qr_code IS NULL` no DB |

**Report**: `qa-reports/e2e-cross-O-regression-r3.md`

**Bugs a procurar (regression)**:
- Algum dos 15 casos volta a falhar como na round 2
- Side-effects inesperados (ex: chat customer quebra ao usar SuggestionChip)
- Migration 035→036 rename causa downgrade em outros tenants

---

### Subagent P · UI redesign customer chat V20

> **Sims**: 1 (Customer iOS sim 1, Pedro Mesa M05).
> Cobre Categoria 4 do round 3 — port do canvas v20 pro chat customer.

**Spec source-of-truth**:
- `docs/design-canvas/cliente-journey-v20.html` (renderizado do .jsx)
- `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx`
- 4 screenshots-alvo definidos no canvas:
  - 07 welcome no chat do cliente novo · iOS
  - 08 chat dos já-na-mesa
  - 04 chat turn com chips após `add_to_order`
  - 03 multi-step (e.g. "queria 1 vinho tinto" → "Tinto, branco ou rosé?")

**Sequência (5 passos)**:

1. Pedro entra em M05 (auto-recognize), abre `/restaurant_dev/assistente`. **Screenshot 1** (welcome novo). Validar:
   - Header: `Trattoria Luna · Mesa 14 · com Caleb` (label dinâmica via `session.tableLabel`)
   - Eyebrow `VOCÊ ENTROU AGORA · HH:MM` antes da primeira interação
   - Placeholder do input: `Pergunte alguma coisa...`
2. Pedro digita "1 risoto". → IA chama `add_to_order` (validar tool_calls populated). **Screenshot 2** (turn com chips). Validar:
   - Eyebrow `··· USANDO ADD_TO_ORDER ···` antes do bubble
   - Chips: "Ver pedido / Pedir mais / Pedir conta" (canônicos do tool)
   - Bubble do customer: "Você · agora" timestamp
3. Após `add_to_order`, Pedro digita "queria 1 vinho tinto". IA pergunta categoria. **Screenshot 3** (multi-step). Validar chips Tinto/Branco/Rosé/Recomende você.
4. Late-arrival flow: Marina escaneia M05 (sim 2 hipotético OU DB direct). Aprova. Volta pro chat do Pedro: **screenshot 4** (já-na-mesa) com system join notice tracejado: `MESA 14 · AGORA / Marina entrou na mesa de vocês.`
5. Após `send_complaint` ou `send_message_to_manager`: placeholder muda pra `Mensagem para a casa`. Confirmar via screenshot.

**Aceitação**: 4 screenshots Playwright (393×852) bate com o canvas v20 (eyebrows, system notice, tool eyebrow, placeholder contextual presentes).

**Bugs a procurar**:
- Eyebrow não aparece (lastToolName state não atualizado)
- System join notice não dispara (WS event missing)
- Placeholder não muda contextualmente

**Report**: `qa-reports/e2e-cross-P-chat-v20.md` + screenshots em `qa-reports/screenshots/P/`.

---

### Subagent Q · Continuation feature 5 kinds × 2 segments

> **Sims**: 1 (Customer iOS sim 1).
> Cobre Categoria 5 do round 3 — 5 novos kinds + segment regular/vip.

**Spec source-of-truth**:
- `services/ai-service/services/continuation.py` DEFAULTS dict
- Canvas v20 prints: `viu cardápio · iOS`, `chamou garçom · iOS`, `abriu pedido · iOS`, `pagou · iOS`, `voltou sem ação · iOS`

**Sequência (10 cenários · 5 kinds × 2 segments)**:

| # | Customer | kind | Setup |
|---|---|---|---|
| Q.1 | Pedro (regular, returning) | `viu_menu` | sessão M05 com `assistant_messages` recente que tenha tool_calls @> view_menu |
| Q.2 | Ana (VIP, returning) | `viu_menu` | mesma situação · tom mais quente esperado |
| Q.3 | Pedro | `chamou_garcom` | `waiter_calls` row recente status=pending |
| Q.4 | Ana (VIP) | `chamou_garcom` | idem |
| Q.5 | Pedro | `abriu_pedido` | `orders` aberto status=preparing · primary_cta "Acompanhar pedido" |
| Q.6 | Ana (VIP) | `abriu_pedido` | idem |
| Q.7 | Pedro | `pagou` | `payments` recente status=confirmed (< 10min) |
| Q.8 | Ana (VIP) | `pagou` | idem |
| Q.9 | Pedro | `voltou_sem_acao` | sessão reabriu sem nenhum evento recente |
| Q.10 | Ana (VIP) | `voltou_sem_acao` | idem |

**Aceitação**: pra cada cenário:
- `GET /api/restaurant_dev/continuation?kind=<kind>&isReturning=true&isVip=<bool>&customerName=<name>`
  retorna `rendered`, `chips`, `subtitle`, `primary_cta` opcional
- Screenshot da home `/restaurant_dev` mostra `ContinuationHome` com texto correto + chips canon
- VIP segment usa tom mais caloroso (validar prosa)

**Bugs a procurar**:
- kind ausente cai pro idle_nudge (default)
- chips vazios em algum kind
- primary_cta de `abriu_pedido` não renderiza

**Report**: `qa-reports/e2e-cross-Q-continuation.md` + 10 screenshots.

---

### Subagent R · Dead code audit

> **Sims**: 0 (auditoria local).
> Cobre Categoria 13 do round 3.

**Sequência (4 verificações)**:

1. **Files removidos**:
   ```bash
   test ! -f apps/web-customer/src/components/ui/ContextualInputExpand.tsx
   test ! -f apps/web-staff/src/components/manager/MergedTableTile.tsx
   ```
   ESPERADO: ambos retornam 0 (file não existe).

2. **Imports não quebrados**:
   ```bash
   npx tsc --noEmit --project apps/web-customer
   npx tsc --noEmit --project apps/web-staff
   ```
   ESPERADO: 0 errors.

3. **SuggestionChip wirado**:
   ```bash
   grep -n "SuggestionChip" apps/web-customer/src/app/[slug]/assistente/page.tsx
   ```
   ESPERADO: pelo menos 2 referências (import + uso no map de chips).

4. **ContinuationHome wirado**:
   ```bash
   grep -n "ContinuationHome" apps/web-customer/src/app/[slug]/page.tsx
   ```
   ESPERADO: 1+ referências (não mais é dead code).

**Report**: `qa-reports/e2e-cross-R-dead-code.md`.

---

### Subagent K · update (round 3)

Substituir Tabela do passo 3 do Subagent K — agora cada tool **DEVE**
retornar `chips` populated (round 3 Cat 1 / K-9). Se vier vazio, é
regression. Tools cobertas com chips: `view_menu`, `add_to_order`,
`view_order`, `pay_full`, `pay_individual`, `split_bill`, `request_check`,
`call_waiter`, `send_complaint`, `recommend_dish` (já tinha),
`show_lgpd_notice` (já tinha).
