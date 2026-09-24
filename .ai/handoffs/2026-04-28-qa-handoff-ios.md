# QA Handoff — iOS Simulator Real Testing

**Para:** próxima sessão do Claude Code (mesma máquina, mesmo repo, sessão nova).
**Última atualização:** 2026-04-28.
**Autor da entrega:** Claude na sessão anterior, depois de patchear N bugs e finalmente decidir parar de jogar whack-a-mole e construir rede de proteção automatizada.

---

## TL;DR — O que você vai fazer

Você é a continuação de uma sessão de QA num SaaS de restaurante (`~/meus_projetos`). O dono do projeto tá frustrado porque cada bug consertado gera 3 novos. Já existe **rede de proteção scripted (Playwright + WebKit emulando iPhone 14)** com 8 testes verde. Agora precisa rodar **QA exploratório no iOS Simulator REAL** (já booted, iPhone 16 Pro / iOS 18.1) usando o **XcodeBuildMCP** que está instalado e configurado.

**Sua missão:** descobrir bugs que não aparecem na emulação WebKit mas aparecem no Safari iOS de verdade, listar TODOS, depois corrigir aplicando o workflow rigoroso descrito abaixo (suite verde antes E depois de cada fix).

**Importantíssimo:** o usuário pode estar com o Claude Code em **plan mode** (flag de boot do harness). Subagents que você despacha vão herdar isso. Se eles voltarem reclamando "I cannot proceed because plan mode is active", peça pro usuário **Shift+Tab** pra alternar pra modo normal.

---

## Estado do código (validado, pronto pra usar)

### Stack

- Monorepo npm workspaces em `~/meus_projetos`
- `apps/web-customer` — Next.js 14 App Router, customer-facing, porta `3003`
- `apps/web-staff` — Next 14 staff app, porta `3002`
- `apps/api` — NestJS, porta `3001`
- `services/ai-service` — Python FastAPI, porta `8000`, fala com **LM Studio** local em `host.docker.internal:1234` (modelo `qwen2.5-7b-instruct-mlx`)
- `packages/database/migrations/tenant-template/` — schema postgres multi-tenant (search_path por tenant)
- Postgres porta 5434, Redis porta 6380 (mapeados pra fora do Docker)

### Tudo via Docker compose

```bash
cd ~/meus_projetos
docker compose up -d
docker compose ps   # confirma 5 containers healthy/running
```

Variáveis em `.env` na raiz (gitignored). Importantes:

- `PUBLIC_HOST=<IP-da-LAN>` (IP atual do Mac no hotspot do iPhone do usuário; pode estar em outra rede — verifique com `ifconfig en0 | grep 'inet '`)
- `CORS_ORIGINS` — inclui localhost:3003, <IP-da-LAN>:3003, <IP-da-LAN>:3003

### Customer app — arquitetura crítica

- `src/app/[slug]/mesa/[tableCode]/page.tsx` — entry point pós-QR scan. Tem 2 useEffects: o original que faz `initSession` (QR HMAC → POST `/session/init` → setSession + recognize via cookie OR exibe WelcomeModal), e o que adicionei pra rehidratar quando `isValid` já era true no mount (capturado via `useRef` pra não correr com o initSession). **NÃO MEXA NESSA LÓGICA SEM ENTENDER O RACE — tem comentário grande explicando.**
- `src/providers/SessionProvider.tsx` — persiste `{sessionId, tableCode, tableLabel, slug}` em `sessionStorage['session:bundle']` pra sobreviver hard reload.
- `src/components/layout/AppShell.tsx` — wrapper de quase toda página. Renderiza TopBar + main + MenuDrawer (gated por `sessionId`).
- `src/components/ui/MenuDrawer.tsx` — bottom drawer hamburger. Body scroll lock via `position:fixed` no body (não `overflow:hidden` que iOS Safari ignora).
- `src/components/layout/TopBar.tsx` — sticky top, padding-top via `style={{paddingTop:'max(env(safe-area-inset-top),8px)'}}`. Inline style porque Tailwind utility `pt-safe` em globals.css ganhava em source order e dava 0px.
- `src/lib/api.ts` — fetch helper. `API_BASE_URL = '/api'` (relativo, mesmo origin) — Next.js rewrite faz proxy pra `http://api:3001/api/*` no docker network. **Não use URL absoluta no client.** Cookie httpOnly + header `x-session-token` (fallback cross-origin).
- `next.config.js` — tem o rewrite `/api/:path* → ${API_UPSTREAM}/api/:path*` (default `http://api:3001`).

### API multi-tenant

- Toda rota é `/:slug/<resource>`, ex: `/restaurant_dev/session/init`.
- Tenant decidido via `slug` na URL → `tenant-connection.provider.ts` SET search_path antes de cada query.
- Schema seed em `restaurant_dev` tem 5 mesas (M01–M05), tabela `tables` com `qr_hmac_secret` UUID por mesa.

---

## Suite Playwright (rede de proteção atual — JÁ FUNCIONA)

### Localização

- `apps/web-customer/playwright.config.ts` — projeto único `iphone-14`, WebKit, viewport 390×844, touch, hover off, fullyParallel false, workers 1
- `apps/web-customer/e2e/helpers/` — `qr.ts` (HMAC + URL builder + secrets), `session.ts` (`newSession`, `welcomeAs`, `openDrawer`, `closeDrawer`)
- `apps/web-customer/e2e/specs/critical-paths.spec.ts` — 8 testes cobrindo fresh user, returning user, drawer, CTA, chamar garçom, cancel, hard reload, back button

### Como rodar

```bash
cd ~/meus_projetos/apps/web-customer
npx playwright test --project=iphone-14 --reporter=list
# ou
npm run e2e
```

Esperado: **8 passed em ~10s** se Docker stack tá up. Se falhar:

- "fresh user welcome" timing out → Next ainda compilando rotas, retry; OU customer já existe no DB e modal pula direto pra home.
- Outro red → bug real, NÃO TENTE arrumar o teste antes de investigar a causa.

### CPFs válidos (passa o validator)

- `12345678909` — Caleb Teste (mesa M01, scripted suite)
- `52998224725` — Maria Silva (mesa M02)
- `39053344705` — João Pedro (mesa M03)
- `11144477735` — Ana Clara (mesa M04)
- `71428793860` — Pedro Santos (mesa M05)

### HMAC secrets das mesas (não rotacione sem atualizar `e2e/helpers/qr.ts`)

- M01: `38889aad-20d1-4778-b4ab-df35774c0398`
- M02: `2f00b359-6d69-408a-a50e-84ffbe44ea45`
- M03: `c86f607f-c703-4184-a81e-3132b7709489`
- M04: `494b31ee-0a6a-4b66-9375-790cbc32d7b1`
- M05: `97a8facb-7ad3-4912-b298-058bb9748de1`

Algoritmo: `HMAC-SHA256(`${tableCode}:${tsMs}`, secret)`. URL final: `http://${host}:3003/restaurant_dev/mesa/${code}?hmac=${sig}&ts=${tsMs}`.

---

## XcodeBuildMCP — testes em iOS Simulator REAL

### Setup já feito

- Pacote `xcodebuildmcp@2.3.2` instalado globalmente em **Node 22.18.0** (Node 18 não funciona — usa `styleText` de `node:util`).
- Wrapper em `~/bin/xcodebuildmcp-node22.sh` força Node 22 + ativa workflows extras (ui-automation, logging, utilities).
- Registrado em `~/.claude.json` mcpServers como `xcodebuildmcp` apontando pro wrapper.
- Verificar: `claude mcp list` deve mostrar `xcodebuildmcp: ... ✓ Connected`.
- 44 tools expostos. Workflows ativos: `simulator, simulator-management, session-management, ui-automation, logging, project-discovery, utilities`.

### Tools mais importantes

| Tool                                                         | Pra quê                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `mcp__xcodebuildmcp__session_show_defaults`                  | Sempre rode primeiro pra ver o sim default.                                                             |
| `mcp__xcodebuildmcp__session_set_defaults`                   | Salvar simulatorId + plataforma.                                                                        |
| `mcp__xcodebuildmcp__list_sims`                              | Listar simuladores e ver qual tá `Booted`.                                                              |
| `mcp__xcodebuildmcp__boot_sim`                               | Bootar (se não estiver booted).                                                                         |
| `mcp__xcodebuildmcp__open_sim`                               | Abrir o app Simulator.app pra ver visualmente.                                                          |
| `mcp__xcodebuildmcp__screenshot`                             | Captura tela atual, retorna PNG/JPG path. **Read no path pra ver.**                                     |
| `mcp__xcodebuildmcp__snapshot_ui`                            | DOM/view hierarchy com **coordenadas x,y de cada elemento**. Use ANTES de tap pra saber pra onde mirar. |
| `mcp__xcodebuildmcp__tap`                                    | Tap nas coords.                                                                                         |
| `mcp__xcodebuildmcp__type_text`                              | Type texto. Útil pra inputs.                                                                            |
| `mcp__xcodebuildmcp__swipe`                                  | Scroll.                                                                                                 |
| `mcp__xcodebuildmcp__key_press`                              | Botões hardware (home, lock).                                                                           |
| `mcp__xcodebuildmcp__start_sim_log_cap` / `stop_sim_log_cap` | Capturar logs Console.app.                                                                              |

### iOS Simulator atual (booted)

```
iPhone 16 Pro (60ED4E4A-976B-4C6E-BE65-779B45EDA867) — iOS 18.1 — Booted
```

Se não estiver booted: `mcp__xcodebuildmcp__boot_sim` + `mcp__xcodebuildmcp__open_sim`.

### Como abrir o app no Safari iOS Simulator

```bash
# 1. Gere uma URL HMAC válida (use Node — TS não roda direto):
node -e "
const c = require('crypto');
const ts = Date.now().toString();
const sig = c.createHmac('sha256', '38889aad-20d1-4778-b4ab-df35774c0398').update('M01:'+ts).digest('hex');
console.log('http://localhost:3003/restaurant_dev/mesa/M01?hmac='+sig+'&ts='+ts);
"
# 2. Abra no Safari iOS Sim:
xcrun simctl openurl booted "http://localhost:3003/restaurant_dev/mesa/M01?hmac=...&ts=..."
# 3. Screenshot:
# mcp__xcodebuildmcp__screenshot returnFormat=path → Read no path retornado
```

**Não há tool `openurl` no MCP — use `xcrun simctl openurl booted` via Bash.** Funciona.

---

## Workflow rigoroso pra cada bug que você for consertar

> Esse processo existe porque o usuário tá cansado de patches que regridem.

```
PARA CADA BUG:
1. Reproduza o bug primeiro (scripted OU iOS Sim — ambos se possível)
2. Crie um teste FALHANDO em e2e/specs/critical-paths.spec.ts (ou novo spec) que captura o bug
3. Confirme: npm run e2e → o teste novo deve falhar
4. Aplique o fix mínimo
5. Re-rode: npm run e2e → TODOS verde, incluindo o teste novo
6. Manualmente reproduza no iOS Sim real (screenshot antes/depois)
7. Commit (não push) com mensagem "fix(escopo): descrição — covered by <test-name>"
8. Só passe pro próximo bug DEPOIS dos passos 1-7 fechados
```

**Nunca pule o passo 2.** Bug sem teste é bug que volta. **Nunca pule o passo 5.** Suite que não roda completa = você não tem rede.

---

## Bugs conhecidos — status

### ✅ Já consertados (mantidos por testes)

1. **Backdrop chamar garçom interceptava o tap em "Chamar agora"**
   - Causa: `<button absolute inset-0>` + sheet em flow → CSS painting order → backdrop pintava por cima.
   - Fix: container `fixed inset-0 z-50`, backdrop `absolute z-0`, sheet `relative z-10`.
   - Arquivo: `apps/web-customer/src/app/[slug]/garcom/chamar/page.tsx:67-75`
   - Coberto por: spec `chamar garcom: tap em "Chamar agora" navega pra /chamando com Rodrigo`

2. **Drawer "soltava" da tela em scroll iOS**
   - Causa: `body { overflow: hidden }` ignorado por iOS Safari → momentum scroll passava por baixo.
   - Fix: `position: fixed` no body + restaurar `scrollY` no cleanup.
   - Arquivo: `apps/web-customer/src/components/ui/MenuDrawer.tsx:36-69`
   - Coberto por: specs de drawer

3. **Topbar grudava no notch sem padding**
   - Fix: inline `paddingTop: max(env(safe-area-inset-top), 8px)` em `TopBar.tsx:25-28`.

4. **5 páginas leaf sem botão back**
   - Fix: passa `onBack={() => push('/${slug}/assistente')}` em chamando, enviado, pix, erro.

5. **Cancelar chamado travava em splash "Preparando sua experiência"**
   - Causa: `router.back()` voltava pra /mesa/M01?hmac=... → mesa page tinha `if (isValid) return` no useEffect → pageState ficava 'loading' pra sempre.
   - Fix duplo:
     - `garcom/chamando/page.tsx`: troquei `router.back()` por `push('/${slug}/assistente')`.
     - `mesa/[tableCode]/page.tsx`: novo useEffect que rehydrata se `isValid` veio true no mount, transiciona pra 'home' fetchando settings+home.
   - Coberto por: spec `cancelar chamado leva pro /assistente sem trava de splash`

6. **Race condition no mesa page** (descoberto pela própria suite)
   - Causa: meu fix do bug 5 fazia useEffect disparar quando isValid passava de false→true durante initSession → `setPageState('home')` antes do customer recognition completar → "Olá, visitante!" sem nome.
   - Fix: `useRef(isValid)` capturando valor inicial; só roda path de rehydrate se isValid era true NO MOUNT.
   - Arquivo: `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx:78-115`
   - Coberto por: spec `drawer abre e mostra itens de navegacao`

7. **Inputs com font-size < 16px disparavam zoom no iOS**
   - Fix global em `globals.css` dentro de `@supports (-webkit-touch-callout: none)`: `font-size: max(16px, 1em)` em inputs/textareas/selects.

8. **`pb-safe` resolvia pra 0 em telas sem notch + perdia baseline**
   - Fix em `globals.css`: `.pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 24px); }`.

9. **API:3001 bloqueada no firewall do Mac quando testando do iPhone real**
   - Solução: Next rewrite `/api/:path* → http://api:3001/api/:path*` (`apps/web-customer/next.config.js`). iPhone só fala com 3003.

### ❌ Backlog (não consertados, ordenados por prioridade)

#### Bug A — Mensagem "Bem-vindo de volta, X. Da última vez você escolheu Y" não aparece pra usuário retornante

**Sintoma:** usuário com cookies vê greeting genérico em vez do "ASSISTENTE · RECONHECEU VOCÊ" do design.

**Causa:** `apps/api/src/modules/home/home.service.ts:91-92` — `isReturning` só vira true se houver linha em `customer_consumption_summary` (tabela só populada após order CONFIRMADO). Em DB fresco / sem orders, `isReturning=false` mesmo com `customers.total_visits > 1`.

Frontend em `mesa/[tableCode]/page.tsx:285` condiciona `returningHighlight` a `isReturning && lastItems.length > 0`. Função `buildReturningMessage` (linha 359) JÁ tem fallback pra quando lastItems vazio, mas nunca é alcançado porque a flag isReturning vem false.

**Fix proposto:**

- Backend: add query a `customers.total_visits`, set `isReturning = totalVisits > 1`.
- Frontend: troca condição pra `isReturning ? buildReturningMessage(firstName, lastItems) : null`.

**Teste a escrever primeiro:** spec que faz welcome → fecha → 2ª visita → assertiva sobre kicker "RECONHECEU VOCÊ" + texto incluindo "Bem-vindo de volta".

#### Bug B — Drawer não mostra participantes em tempo real

**Sintoma:** "Sessão ativa" sem listar quem mais tá na mesa.

**Estado:** **feature parcialmente feita**. Backend completo em `apps/api/src/modules/table-session/table.controller.ts:15-22` (`GET /:slug/table/participants`). Customer welcome/recognize JÁ chamam `upsertParticipant` (`customers.service.ts:81,143`). SessionProvider expõe `participants/setParticipants` mas ninguém populariza.

**Fix proposto:**

- Novo `apps/web-customer/src/hooks/useParticipantsPoll.ts` — polling 5s.
- AppShell chama o hook quando `sessionId` existe + passa `participants` ao MenuDrawer.
- MenuDrawer renderiza seção "Na mesa agora (N)" com bullets coloridas + nome.

**Teste:** 2 contextos Playwright (BrowserContext A e B) na mesma mesa, espera ver A no drawer de B.

#### Bug C — Chamar garçom como ROTA, deveria ser OVERLAY arrastável

**Sintoma:** tap em "Chamar garçom" navega pra `/garcom/chamar` substituindo a tela atual; usuário queria sheet sobreposta com drag-to-dismiss preservando o cardápio atrás.

**Fix proposto (escopo médio):**

- Estado global em `UIStateProvider`: `garcomSheet: 'closed' | 'picking' | 'waiting'` + persist em sessionStorage.
- Componente raiz `GarcomSheet.tsx` montado uma vez no AppShell.
- Drag gesture via `onTouchStart/Move/End`: track `dragY`, snap close se `>120px`.
- 2 níveis: PickReason → Waiting (com Rodrigo). Cancel → close, página de fundo intacta.
- Refactor: extrair `useBodyScrollLock` hook compartilhado entre Drawer e GarcomSheet.

**Teste:** abrir cardápio, scrollar até categoria, abrir drawer → Chamar garçom, snapshot mostra cardápio intacto atrás, swipe down fecha sheet, cardápio ainda na mesma categoria.

#### Bug D — Host approval flow (FEATURE NOVA)

**Pedido do usuário:** primeiro a escanear QR vira "host". Quem entrar depois precisa da autorização do host pra entrar na comanda.

**Decisões já tomadas (confirmadas):**

- Joiner preenche WelcomeModal (nome + CPF) **antes** da aprovação. Host vê dados pra decidir.
- Host vê pendentes no drawer + banner fino no topo.
- Migration nova: `host_customer_id` em table_sessions + tabela `session_join_requests` (id, table_session_id, customer_id, status pending|approved|rejected|cancelled, timestamps).

**Plus:** initSession de table-session.service.ts hoje INSERT-a uma table_session por scan. Pra group flow, scans subsequentes da mesma mesa ATIVA precisam reusar a mesma row. **Esse é pré-requisito do Bug D.**

**Detalhes completos** estão em `~/.claude/plans/rippling-whistling-mitten.md` (plan file que escrevi antes — leia antes de implementar).

---

## Plano de execução pro novo Claude (faça nessa ordem)

### Etapa 0 — Sanidade (15 min)

```bash
# 1. Working dir
cd ~/meus_projetos
pwd  # confirma

# 2. Docker
docker compose ps  # 5 containers, 4 healthy + 1 running
# Se nada running: docker compose up -d

# 3. App alcançável
curl -s -o /dev/null -w "web:%{http_code}\n" http://localhost:3003/
curl -s -o /dev/null -w "api:%{http_code}\n" http://localhost:3001/api/restaurant_dev/settings/public
# Esperado: web:200, api:200

# 4. AI service
curl -s http://localhost:8000/health
# Esperado: {"status":"ok",...,"model_main":"qwen2.5-7b-instruct-mlx"}

# 5. Suite scripted
cd apps/web-customer
npx playwright test --project=iphone-14 --reporter=list
# Esperado: 8 passed em ~10s
```

Se algo falhar nessa etapa, **conserte ANTES de avançar**. Documento no fim tem troubleshooting.

### Etapa 1 — Confirma MCP do iOS Sim (5 min)

```bash
claude mcp list
# Esperado: xcodebuildmcp ✓ Connected

xcrun simctl list devices booted
# Esperado: iPhone 16 Pro (60ED4E4A-976B-4C6E-BE65-779B45EDA867) (Booted)
# Se não houver booted: xcrun simctl boot 60ED4E4A-976B-4C6E-BE65-779B45EDA867
```

No Claude Code, valide tool call simples:

1. Chame `mcp__xcodebuildmcp__session_show_defaults`
2. Chame `mcp__xcodebuildmcp__session_set_defaults` com `simulatorId: "60ED4E4A-976B-4C6E-BE65-779B45EDA867"`
3. Chame `mcp__xcodebuildmcp__screenshot` com `returnFormat: "path"` → Read no path retornado → você deve ver a home screen do iOS

Se algum dos tools NÃO aparece nas suas ferramentas disponíveis, peça pro usuário fechar e abrir uma janela nova do Claude Code.

### Etapa 2 — QA exploratório no iOS Sim real (60-90 min)

Escolha um dos fluxos críticos abaixo, abra a URL no Safari iOS Sim, navegue tappando, capture screenshots em cada estado, compare com o que o Playwright WebKit faz no mesmo fluxo. Anote bugs.

**Fluxos críticos a varrer:**

1. **Fresh QR scan**: openurl com URL HMAC nova → modal Welcome → preenche nome+CPF → tap Continuar → home com botões. Confirma que o usuário recém-criado existe no DB:
   ```sql
   PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas \
     -c "SET search_path = restaurant_dev; SELECT name, cpf, total_visits FROM customers ORDER BY created_at DESC LIMIT 3;"
   ```
2. **Returning user**: faz fluxo 1, depois openurl da mesma URL HMAC → não deve ver modal, deve cair direto na home com greeting personalizado (procurando o bug A).
3. **Drawer**: home → tap hamburger → drawer abre → tap "Voltar ao assistente" → /assistente.
4. **Cardápio**: home → tap "Ver cardápio" → categorias renderizam → tap item → tela detalhe → tap "Adicionar ao pedido" → seleciona comanda → revisar.
5. **Chamar garçom**: drawer → Chamar garçom → seleciona motivo → Chamar agora → vê Rodrigo → Cancelar → cai no /assistente (não no splash).
6. **Pedido completo**: cardápio → +item → revisar → confirmar → countdown 15s → enviado.
7. **Pagamento Pix**: pagamento → Pix → vê QR + countdown.
8. **Hard reload**: cardápio → pull-to-refresh ou simctl reload → drawer ainda funciona.

Pra cada fluxo, formato do bug se encontrar:

```
BUG #X — <título curto>
Fluxo: <onde apareceu>
Ambiente: iOS Sim 18.1 / Safari (NÃO REPRODUZ em WebKit emul ☐ / REPRODUZ em ambos ☐)
Passos:
  1. ...
Esperado: ...
Real: ... (anexa screenshot path)
Hipótese causa: <arquivo:linha se já souber>
```

### Etapa 3 — Triagem e fix (variável)

1. Liste bugs em ordem de gravidade (critical→trivial).
2. Pra cada um, siga o **Workflow rigoroso** lá em cima (teste primeiro, fix segundo, suite verde terceiro).
3. Quando acabar a fila, re-rode a suite uma última vez. Se 8/8 + os novos testes verdes, fim.

### Etapa 4 — Backlog (Bug A → B → C → D, NESSA ORDEM)

Só ataque depois que a Etapa 3 estiver fechada (sem reds nem bugs novos). Cada bug A/B/C/D tem proposta de fix lá em cima — siga.

---

## NÃO FAZER (anti-patterns)

❌ **Não use `nth(0)`, `nth(1)` etc. em selectors Playwright.** Inputs reordenam em re-render. Use `getByPlaceholder`, `getByRole`, `getByText`.

❌ **Não use `router.back()` no customer app** (exceto pra fechar bottom sheets simples). Pilha de navegação é frágil — usuário pode acabar em /mesa que reinicia o splash. Use `push` direto pra rota destino sensata (`/assistente` é o default seguro).

❌ **Não dê commit em pull request main / master.** Trabalhe em branches feature.

❌ **Não desabilite testes que tão falhando.** Resolva o bug ou ajuste o teste com justificativa em comentário.

❌ **Não rode `git push --force` em main.**

❌ **Não rode migrações em produção** (não tem produção pra esse projeto, mas é hábito).

❌ **Não modifique o `.env` do projeto sem checkar.** Tem secrets de dev.

❌ **Não faça pedidos enormes pros agents** que herdam plan mode — eles ficam paralisados. Se notar isso, abandone o agent e faça manual ou peça /shift+tab pro usuário.

❌ **Não tente bypassar plan mode via prompts.** É flag de boot do Claude Code, hardware-level. Só Shift+Tab desliga.

---

## Comandos de emergência

```bash
# Reset do dev DB (CUIDADO — apaga tudo)
docker compose down postgres -v && docker compose up -d postgres
# Espera healthy + roda migrações via API restart:
docker compose restart api
# (a API tem auto-migrate ao subir; ver apps/api/src/infra/database)

# Forçar Next.js recompile
docker compose restart web-customer

# Limpa Playwright artifacts
rm -rf apps/web-customer/test-results apps/web-customer/playwright-report

# Logs API ao vivo
docker logs -f restaurant-api

# Ver últimas waiter_calls no DB
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas \
  -c "SET search_path = restaurant_dev; SELECT id,status,reason,created_at FROM waiter_calls ORDER BY created_at DESC LIMIT 10;"

# Ver últimos orders
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas \
  -c "SET search_path = restaurant_dev; SELECT id,status,total_cents,created_at FROM orders ORDER BY created_at DESC LIMIT 10;"

# Gerar QR pra impressão (mesa M01)
node -e "
const c=require('crypto');const ts=Date.now().toString();
const sig=c.createHmac('sha256','38889aad-20d1-4778-b4ab-df35774c0398').update('M01:'+ts).digest('hex');
console.log('http://localhost:3003/restaurant_dev/mesa/M01?hmac='+sig+'&ts='+ts);
"
# Pra QR visual: qrencode -o /tmp/m01.png "$(node -e ... )" && open /tmp/m01.png
```

---

## Troubleshooting comum

**Suite vermelha em "fresh user welcome"**

- Causa A: customer com CPF 12345678909 já existe → recognition ainda funciona via cookie? Verifique `context.clearCookies()` em beforeEach.
- Causa B: Next.js recompilando → primeira navegação leva 10-20s. O test em `critical-paths.spec.ts:25` tem `waitUntil: 'networkidle'` + timeout 30s pra cobrir isso.

**`xcodebuildmcp ✗ Failed to connect`**

- Confira `cat ~/.claude.json | python3 -c "import json,sys;print(json.load(sys.stdin)['mcpServers'])"`
- Confira o wrapper: `cat ~/bin/xcodebuildmcp-node22.sh` — deve usar Node 22 path.
- Teste manual: `echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}},"id":1}' | ~/bin/xcodebuildmcp-node22.sh` — deve printar "Server initialized".

**Subagents voltam falando que estão em plan mode**

- Sessão pai está em plan mode. Peça Shift+Tab pro usuário.
- NÃO insista nos prompts — eles não conseguem sair via texto.

**iPhone real não conecta no API mas Sim funciona**

- macOS Application Firewall bloqueia 3001 vindo de fora.
- Solução já aplicada: Next rewrite proxy. Cliente fala só com 3003. Se não tiver: ver `apps/web-customer/next.config.js`.

**LM Studio não responde / `/chat` 500**

- LM Studio precisa estar com modelo `qwen2.5-7b-instruct-mlx` carregado em `localhost:1234`. Se não, o usuário precisa abrir LM Studio e Load.
- AI service container envia pra `host.docker.internal:1234` (configurado em docker-compose).

---

## Apêndice: arquivos importantes

| Arquivo                                                      | Pra quê                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `apps/web-customer/playwright.config.ts`                     | Config do test runner                                         |
| `apps/web-customer/e2e/helpers/qr.ts`                        | URL HMAC builder + secrets                                    |
| `apps/web-customer/e2e/helpers/session.ts`                   | `newSession`, `welcomeAs`, `openDrawer`                       |
| `apps/web-customer/e2e/specs/critical-paths.spec.ts`         | 8 testes que precisam ficar verde                             |
| `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx` | Entry point pós-QR — RACE CONDITION DELICADO                  |
| `apps/web-customer/src/providers/SessionProvider.tsx`        | Bundle session em sessionStorage pra rehydrate                |
| `apps/web-customer/src/components/ui/MenuDrawer.tsx`         | Body lock fix iOS                                             |
| `apps/web-customer/src/components/layout/TopBar.tsx`         | Safe-area inline style                                        |
| `apps/web-customer/next.config.js`                           | Rewrite /api/\* pra api container                             |
| `apps/api/src/modules/home/home.service.ts`                  | `isReturning` lógica (Bug A está aqui)                        |
| `apps/api/src/modules/table-session/table.controller.ts`     | Endpoint participants (Bug B precisa só do plumbing frontend) |
| `apps/api/src/modules/customers/customers.service.ts`        | welcome + recognize (Bug D vai mexer aqui)                    |
| `~/.claude/plans/rippling-whistling-mitten.md`               | Plano detalhado dos Bugs A/B/C/D                              |
| `~/bin/xcodebuildmcp-node22.sh`           | Wrapper do MCP                                                |

---

## Checklist final antes de devolver pro usuário

- [ ] Suite Playwright 100% verde (8 + novos testes)
- [ ] Todos os bugs novos descobertos no iOS Sim foram cobertos por testes
- [ ] `git status` mostra só os arquivos alterados intencionalmente
- [ ] Nenhum `console.log` ou `debugger` esquecido
- [ ] Comentários explicam **por que**, não **o que** (o código já mostra o quê)
- [ ] Bugs do backlog (A/B/C/D) cuja prioridade você atacou estão fechados com testes
- [ ] `docker compose ps` mostra tudo healthy

---

**Boa sorte. Quando bater dúvida, leia o `~/.claude/plans/rippling-whistling-mitten.md` — eu deixei as decisões de arquitetura lá.** Esse arquivo é seu mapa: ele tem informação que eu não duplico aqui pra economizar tokens.
