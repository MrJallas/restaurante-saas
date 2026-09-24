# CLAUDE.md — regras para assistentes de código

Instruções para qualquer agente de código (Claude Code, Codex etc.) que trabalhe neste repositório.
**Leia antes de mudar qualquer coisa.** A documentação do produto está em `README.md` e `docs/`; o
material de trabalho com agentes fica em `.ai/`.

---

## Antes de mexer

1. Leia [`.ai/README.md`](.ai/README.md) e [`.ai/MEMORY.md`](.ai/MEMORY.md) antes de qualquer
   auditoria, implementação, revisão ou decisão de comportamento que não seja trivial.
2. "Por que decidimos X": [`docs/decisoes/`](docs/decisoes/README.md) (ADRs) e o RAG do autor, cujo
   comando está em `.ai/README.md`. "Onde está X": Grep/Glob na árvore atual. Não crie índice
   vetorial dentro do repositório: o índice local foi aposentado em 2026-08-31 porque tinha só 55% de
   acerto e servia trechos velhos como se fossem atuais.
3. Mudou comportamento, contrato, rota ou comando de validação? Atualize o doc da área em `docs/` (e o
   ADR, se for decisão) **no mesmo commit**. Em `.ai/MEMORY.md` entra só o que é de processo.
4. `README.md`, `docs/` e os READMEs de `apps/`, `packages/` e `services/` são públicos: nada sobre
   agentes de IA de desenvolvimento neles. Material de agente vai para `.ai/`.
5. Commits sem atribuição de IA. Nada de banco vetorial, embeddings, traces, vídeos ou pacotes de
   capturas no Git: evidência vai para `output/` (ignorado); relatório curado, em texto, para
   `docs/archive/qa/<data>-<slug>/`.
6. Comportamento de produto indefinido: pergunte ao Caleb antes de inventar regra.
7. Convenções de engenharia (migrations, SQL, estados operacionais, anti-placebo, commits, fluxo de
   correção): [`docs/desenvolvimento/convencoes.md`](docs/desenvolvimento/convencoes.md).

---

## 🔒 V20 Customer UI · DO NOT MODIFY

The customer-facing surfaces below were **hand-designed by the project owner
in Round 4** as part of the V20 design language. Visual decisions (spacing,
typography, layout, copy, color tokens) are intentional and were validated
side-by-side via Playwright preview iterations. **Treat these files as
locked unless the user explicitly asks for changes.**

### Locked files (visual + layout)

| File                                                                                                                                                                             | What it owns                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [apps/web-customer/src/components/welcome/WelcomeModal.tsx](apps/web-customer/src/components/welcome/WelcomeModal.tsx)                                                           | Welcome flow · mono eyebrow `MESA N · BEM-VINDO`, title 26/700 "Pra começar, quem é você?", FieldShell pattern, helper mono uppercase, PillButton filled com seta canon. Centralizado via `grid place-items-center` em `h-[100dvh]`. Inputs com label "Seu nome" / "Seu CPF"                                                                     |
| [apps/web-customer/src/components/welcome/CpfInput.tsx](apps/web-customer/src/components/welcome/CpfInput.tsx)                                                                   | CPF input "naked" — NÃO gerencia próprio border; sinaliza `onFocusChange` pro shell pai. Não readicionar border/padding aqui                                                                                                                                                                                                                     |
| [apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx](apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx) | **Gate de CPF** (não é late-arrival) · a tela que 11 call-sites usam quando `useRequireCustomerId` / ScreenCustomerMe / assistente bouncham um cliente já sentado. Mesmo canon do WelcomeModal (eyebrow + title + FieldShell + helper + CTA). Label canon: **"Seu nome"** (não "Seu primeiro nome")                                              |
| [apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx](apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx)       | Waiting screen · bloco unificado eyebrow→title→sub→ícone→pill→CTA centralizado. Sem `flex-1` spacer empurrando CTA pro bottom. Serve DOIS fluxos: junção de mesas (rota `/waiting-approval`) e chegada tardia do System A (montada inline pelo `PendingApprovalWrapper` de `/mesa/[tableCode]`, onde `mode='late-arrival'` é só escolha de copy) |
| [apps/web-customer/src/components/ui/CallWaiterSheet.tsx](apps/web-customer/src/components/ui/CallWaiterSheet.tsx)                                                               | Bottom-sheet vaul-style para `call_waiter` · 5 motivos canon V20 (Trazer cardápio · Fazer pedido · Servir bebida · Pedir conta · Outro motivo) com icon+label+sub. Drag full-area via pointer events + `touch-action: pan-y`                                                                                                                     |
| [apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx](apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx) (linhas do `reclaimBanner`)                             | Reclaim banner · V20 canon discreet hint (`border-soft + bg-surface + mono eyebrow CONTA RECONHECIDA`). NÃO voltar pro amber/yellow                                                                                                                                                                                                              |
| [apps/web-customer/src/app/[slug]/assistente/page.tsx](apps/web-customer/src/app/[slug]/assistente/page.tsx) (landing branch `!chatStarted`)                                     | Landing /assistente · home-like (2 PillButtons grandes "Chamar garçom" + "Ver cardápio" + `HomeHero` com greeting da continuation API). Bubbles de chat só aparecem após 1ª msg do customer; greeting vira o 1º AI bubble preservando contexto                                                                                                   |

### Regras de ouro

1. **Não trocar tokens visuais** (`text-ink`, `text-mute`, `text-faint`,
   `border-soft`, `bg-surface`, `bg-bg`) por outros tokens nesses arquivos.
2. **Não alterar tipografia** (`font-mono` eyebrows 10px tracking-[1.5px],
   titles 26/700 tracking-[-0.024em], body 15/500).
3. **Não alterar layout central** (`grid place-items-center`, `h-[100dvh]`)
   pra empurrar conteúdo pra topo/bottom.
4. **Não trocar copy** "Seu nome" → "Seu primeiro nome" (decisão V20
   confirmada com user).
5. **Não reintroduzir** modal-card com `border-ink` 1.5px e `box-shadow
0 24px 60px` no WelcomeModal — V13 style abandonado.
6. **Não reativar** `flex-1` spacer entre conteúdo e CTA em screens onde
   o V20 colou os elementos.
7. **Não substituir** PillButton custom por `<button>` simples nesses
   surfaces.

### Quando edits são OK

- User PEDE EXPLICITAMENTE pra alterar (ex.: "muda o copy do CTA pra X").
- Bugfix funcional não-visual (ex.: adicionar `aria-*`, fix de event
  handler que não dispara). Mantém o visual idêntico.
- Refactor estrutural (ex.: extrair `FieldShell` pra primitivo
  compartilhado em `components/ui/`) — preservando 100% da aparência.

Se em dúvida, **mostre diff antes de aplicar** ou pergunte ao user.

**Design canon**: `docs/design/canvas/handoff/cliente/cliente-journey-v20.jsx` e
`cliente-late-arrival.jsx`. V20 é o source-of-truth — V13/V14 são legacy. Decisão em
[ADR 0012](docs/decisoes/0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md); mapa
canon × legado e como abrir o canvas em [`docs/design/README.md`](docs/design/README.md).

---

## Invariantes que não podem regredir

- **Chegada tardia**: quem chega a uma mesa ocupada escaneia o QR, vira participante `pending`
  (`TableSessionService.upsertParticipant`) e **só o cliente-anfitrião** decide
  (`POST /:slug/table/participants/decide` → WS `participant:decision`; desistência em
  `.../participants/cancel`). Nunca escala para a equipe, nunca por ferramenta de IA. O segundo sistema
  (`late_arrival_requests`) foi removido na migration 081: não ressuscite; aviso à recepção, se vier, é
  notificação passiva pós-aprovação. [ADR 0005](docs/decisoes/0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md)
- **Primeiro scan de mesa livre** sem liberação vira verificação da recepção (60 s por nível; recepção →
  gerente → garçom). [ADR 0004](docs/decisoes/0004-validar-o-primeiro-scan-do-qr-na-recepcao.md)
- **Identidade do cliente**: `SessionData.customerId` é da mesa e nunca autoriza PII nem ação pessoal;
  use `CallerResolverService` com `recognition_token` e falhe fechado sem cookie. Login só por CPF
  conhecido é exceção temporária aceita, não segurança resolvida: preserve rate limit, token fora do
  body, log mascarado e isolamento por restaurante.
  [ADR 0006](docs/decisoes/0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md)
- **LGPD**: só o botão fora do chat, no navegador autenticado, chama `POST /:slug/lgpd-requests`; a
  ferramenta do LLM nunca apaga. Preserve lease e CAS (migration 079), rotação do token, invalidação do
  cache e desconexão do socket. [ADR 0009](docs/decisoes/0009-excluir-dados-pessoais-so-por-acao-explicita-do-cliente.md)
- **Pix** é demonstração intencional; `/cashier` não liquida.
  [ADR 0008](docs/decisoes/0008-manter-o-pix-como-demonstracao.md)
- **Dinheiro**: taxa de serviço e rateio da mesa só no backend (`BillingService`).
  [ADR 0011](docs/decisoes/0011-calcular-taxa-de-servico-e-rateio-da-mesa-no-backend.md)
- **Migrations** idempotentes (`DO $$ … IF NOT EXISTS`; ex.: 037), nunca editadas depois de aplicadas;
  o runner `packages/database/scripts/migrate-tenants.ts` roda no boot e falha é fatal.
  [ADR 0010](docs/decisoes/0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md)
- **Estados operacionais e anti-placebo**: erro/loading não é vazio, tranquilidade nem not-found;
  preserve dado stale, mostre retry e bloqueie mutação até carregar a entidade autoritativa. Botão sem
  backend é bug. [Convenções](docs/desenvolvimento/convencoes.md)
- **KDS por estação**: todo preparo atualiza `order_items`; `cook`/`bartender` usam kitchen/bar; não
  derive o estágio só de `orders.status`. `lateOrders` é só cozinha, com `prep_started_at` (migration
  078), nunca `orders.updated_at`. No SQL por estação, mantenha `$1::varchar` no `SET status` e no
  `CASE` (sem ele: erro 42P08, com fakes verdes). [Ciclo do pedido](docs/arquitetura/ciclo-do-pedido.md)
- **Carga dos garçons** (`GET /:slug/dashboard/team-kpis` → `waiterWorkload`): cada sessão ativa conta
  uma vez; alerta `manager_staff_workload_imbalance` singleton e só para gerente; normalize o
  `tables-overview.number`, filtre `onShift` na seção "em turno" e preserve o `slug` na navegação.
- **SQL**: `UPDATE/DELETE … RETURNING` consumido passa por `unwrapRows`/`unwrapAffected`
  (`apps/api/src/modules/tenant/query-utils.ts`); fakes imitam a tupla `[rows, rowCount]`.
- **Throttles** de `/customer/welcome` (IP real + sessão, `CUSTOMER_WELCOME_RATE_*`) e
  `/customer/identify` (5/IP/15 min): nunca confie em `X-Forwarded-For`.
- **Continuation API** (`services/ai-service/services/continuation.py`): slot ausente cai em
  fallback; não reverta.
- **Chips canônicos**: ferramentas de mutação do cliente sempre devolvem `chips`; cobertura ≥ 9/10 em
  `services/ai-service/tests/test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations`.
- **Python**: Docker instala `requirements.lock`; testes, `requirements-dev.lock`; regenere os dois
  para Python 3.11 e rode `pip-audit`.
- **Playwright em série**: nunca dois processos ao mesmo tempo (QRTEST91/92 compartilhadas); preserve a
  limpeza das mesas de teste no `finally` do spec da noite. [Testes](docs/desenvolvimento/testes.md)

## Antes de reabrir um achado

Leia [`docs/archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md`](docs/archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md):
gate de 1.597 testes em duas rodadas limpas, `PARTIAL` 96/100 pelo risco aceito do login só por CPF
(correção futura: OTP em canal verificado ou confirmação presencial, nunca mudança silenciosa).
