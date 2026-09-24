# Round 24 — Infra, auditoria UI e diretrizes transversais

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. Este chat trata de:

1. **Auditoria UI sistemática** com IDB (iOS Device Bridge) — descobrir mais bugs do tipo "menu hambúrguer travado" em outras telas
2. **MongoDB** — diretriz: todos os logs/históricos novos vão pro Mongo, não Postgres
3. **Diretrizes transversais** de qualidade de UI que aparecem em vários frontends

---

## Item 1. Auditoria UI sistemática com IDB do Facebook

### Bug observado (raiz)

Tela `/[slug]/conversas-com-ia` (cliente) — o **menu hambúrguer não funciona**. Clicar nos itens do menu não navega ou navega com estado stale.

**Reprodução**:

1. Cliente entra no app
2. Entra em "Conversas com IA"
3. Tenta clicar em itens do menu hambúrguer (Cardápio, Chamar garçom, etc.)
4. Não funciona ou abre com contexto errado

### Hipótese

Esse mesmo problema pode existir em outras telas — a auditoria precisa ser sistemática, não reativa.

### Diretriz

Usar o **IDB do Facebook** (https://github.com/facebook/idb) pra controlar o simulador iOS em tempo real e fazer audit de todas as telas:

- Cliente
- Recepcionista
- Garçom
- Cozinha
- Gerente

Em cada tela, validar:

- Menu hambúrguer funciona (todos os itens navegam corretamente)
- Botão de voltar funciona e respeita histórico
- Sininho de notificações abre tela do role correto
- Bottom nav navega entre abas sem perder estado
- Modals/overlays respeitam safe-area do iOS

### Por que IDB

- Permite controlar simulador via comandos (tap, scroll, screenshot)
- Validação em tempo real junto comigo (Caleb)
- Reprodução determinística

### Critério de aceitação

- [ ] Setup do IDB documentado em `docs/dev/idb-setup.md`
- [ ] Script `scripts/audit-ui.sh` (ou similar) que automatiza navegação em todas as telas + tira screenshots
- [ ] Resultado da auditoria: lista de telas com problemas encontrados
- [ ] Bugs novos abertos no GitHub Issues (ou arquivo `prompts-codex/round-24-followups.md`)

---

## Item 2. MongoDB pra logs/históricos

### Diretriz (do user)

> "tudo que for de logs vamos armazenar no mongo"

Aplica a:

- **Histórico de turnos** (gerente — ver `05-gerente.md` bug 42 + `06-api-transversais.md` bug 42)
- **Logs de auditoria** (quem fez o que / quando — staff actions)
- **Logs de notificações enviadas**
- **Logs de chamados de cozinha → garçom** (fluxo novo do bug 24)
- **Logs de junção de mesas** (incluindo expiradas — bug 30)
- **Logs de "puxar pedido pra frente"** (bug 32)
- **Logs de reclamações** (manter histórico mesmo após resolução)
- **Logs de encerramento de turno** (resumos)

### Setup

Verificar:

- MongoDB já está rodando no ambiente dev (provavelmente sim — checar `docker-compose.yml`)
- Connection string em env vars
- Driver instalado no `apps/api` (pymongo / motor pra Python, mongoose / mongodb pra Node)

Se ainda não tem:

- Adicionar serviço MongoDB no `docker-compose.yml`
- Criar `packages/database/mongo-client.ts` (ou similar) com helper de conexão
- Documentar em `README.md` como subir

### Collections sugeridas (não exhaustive)

- `shift_logs` — resumos de turnos (bug 42)
- `audit_logs` — staff actions com `{ staff_id, action, target, before, after, timestamp }`
- `notifications_log` — todas notificações enviadas (push + UI)
- `kitchen_calls` — chamados da cozinha pra garçom (bug 24)
- `merge_requests_history` — junção de mesas (incluindo expiradas)
- `priority_requests_history` — "puxar pra frente" (bug 32)
- `complaints_archive` — reclamações arquivadas

### Critério de aceitação

- [ ] MongoDB rodando em dev
- [ ] Helper de conexão e CRUD básico documentados
- [ ] Pelo menos 1 collection usada de verdade nesta round (sugestão: `shift_logs` pra destravar o bug 42 do gerente)
- [ ] Indexes apropriados (tenant_id + timestamp na maioria)

---

## Item 3. Diretrizes transversais de UI

### A) Não vazar toasts "em desenvolvimento" pro usuário final

Vários toasts cinza com mensagens tipo `"em desenvolvimento (Onda 3 backend)"` apareceram na auditoria.

**Regra**: ou implementa a funcionalidade real, ou **esconde o botão** até estar pronto. Nada de placeholder visível pro usuário em produção. Se precisar manter pra dev/staging, usar feature flag (env var `NEXT_PUBLIC_SHOW_WIP_FEATURES=true`).

**Auditoria sugerida**: grep no codebase por `em desenvolvimento` e `Onda X backend` — listar todos os pontos e decidir item-a-item:

```bash
rg -i "em desenvolvimento|onda \d backend" apps/
```

### B) Erros técnicos não vazam pra UI

Erros como `xstaff id inválido`, `manager-only endpoint`, `Thread não encontrada` (técnico), `1 erro` (sem contexto) — todos aparecem na UI hoje.

**Regra**: backend retorna estrutura `{ message_user: "...", code: "...", debug?: {...} }`. UI mostra `message_user` amigavelmente, nunca o `code` ou `debug`.

**Auditoria**: rg por strings técnicas vazando:

```bash
rg -i "xstaff|manager-only|host-only|endpoint|undefined|null" apps/web-staff/src apps/web-customer/src
```

### C) Botão voltar respeita histórico de navegação

Bug confirmado no gerente: `Equipe → sub-tela → voltar` vai pro **Painel** em vez de voltar pra Equipe.

**Regra geral**: usar `router.back()` ao invés de `router.push(rotaAbsoluta)`. Se precisar fallback, fallback pra aba de origem (não pro Painel).

### D) Modals respeitam safe-area do iOS

Bug confirmado: modal "Apagar essa conversa?" aparece cortado pela barra de navegação do iOS Safari.

**Regra**: modais bottom-sheet usam `padding-bottom: env(safe-area-inset-bottom)`. Vaul-style sheets (como `CallWaiterSheet.tsx`) já fazem isso — replicar pra outros.

### E) Tema global (claro/escuro/auto)

Mencionado em vários frontends (host bug 11, cozinha bug 25, gerente bug 44). Criar lib compartilhada `packages/ui/theme/` ou `apps/web-staff/src/lib/theme.ts` com:

- Hook `useTheme()`
- Toggle `setTheme(mode)`
- Persistência `localStorage`
- Listener pra `prefers-color-scheme` quando `auto`
- Provider no root layout dos apps

### Critério de aceitação

- [ ] Auditoria de "em desenvolvimento" feita, decisões documentadas
- [ ] Auditoria de strings técnicas vazando feita, todas tratadas
- [ ] Botão voltar audit em todos os apps
- [ ] Safe-area aplicada em modais
- [ ] Lib de tema compartilhada implementada e usada nos 3 frontends staff

---

## Item 4. Geolocalização (componente cross-app)

**Detalhes nos chats**:

- Cliente: `01-cliente.md` bug 1
- Recepcionista: `02-recepcionista.md` bug 1
- API: `06-api-transversais.md` bug 1

**Componente que cai aqui**: documentar setup completo da feature e config do raio:

- Configuração inicial: 3 metros (raio bem pequeno pra testar)
- Configurável pelo gerente futuramente (criar issue/TODO)
- Doc explicando como o gerente seta a lat/long do restaurante (provavelmente via UI futura)

---

## Item 5. Auditoria de E2E após fixes

Após fixes dos chats 01-06 mergeados, rodar suite completa de E2E pra detectar regressões. Importante: specs E2E do Playwright rodam **serialmente** — não disparar 2+ specs em paralelo (helpers compartilham QRTEST91/92 sem customer_id, row vaza entre specs).

Comando:

```bash
cd apps/web-customer && npx playwright test
```

(adaptado por app)

### Critério de aceitação

- [ ] Suite E2E roda limpa após todos os fixes
- [ ] Specs novos pros fluxos críticos (chamar garçom da cozinha, encerrar turno garçom, junção expirada, etc.)

---

## Validação automatizada obrigatória

- Documentar e validar setup idb do Facebook com um fluxo real no simulador iOS: abrir URL, tocar, digitar, capturar screenshot e UI tree.
- Usar MCP Playwright/browser para auditoria das telas staff e screenshots de regressão.
- Usar xcodebuildmcp, se disponível, para inventário/screenshot/UI tree dos simuladores; manter idb como ferramenta principal de interação.
- Ao final dos fixes dos prompts, rodar E2E compartilhado em série, especialmente specs que usam QRTEST91/92.
- Salvar relatório final agregando evidência dos outros chats em `qa-reports/infra-auditoria/`.

## Checklist final do chat

- [ ] IDB setup documentado
- [ ] MongoDB setup confirmado/criado + 1 collection usada (`shift_logs`)
- [ ] Auditoria "em desenvolvimento" feita
- [ ] Auditoria de strings técnicas vazando feita
- [ ] Lib de tema compartilhada implementada
- [ ] Geolocalização: config raio documentada
- [ ] E2E roda limpo após fixes (validação final cross-chat)
