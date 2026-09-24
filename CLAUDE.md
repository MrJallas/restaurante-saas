# CLAUDE.md — Project guidance for AI assistants

Instructions for any AI agent (Claude Code, codex, etc.) operating on this
repository. **READ FIRST** before making changes.

---

## Shared Memory And RAG Discipline

This repository uses project memory as an active coordination surface between
Codex, Claude Code and future local RAG tooling.

1. Read `MEMORY.md` before any non-trivial audit, implementation, review,
   prompt run or product-behavior decision.
2. Keep `MEMORY.md` updated in the same branch/commit when work changes product
   behavior, source priority, prompt state, validation commands, known risks,
   open questions, persona routes or backend/frontend contracts.
3. Retrieval has two surfaces, and they are not interchangeable:
   - **Why a decision was made** → the canonical vault RAG:
     `bash '/Users/calebmedeiros/obsidian/memorias de caleb/rag/recall.sh' "question" --project restaurante-saas`.
     It indexes the reasoning about this codebase, not the codebase.
   - **Where something lives in the code** → Grep/Glob, which always read the
     current tree.
     The repo-local vector index was retired on 2026-08-31: it had drifted to 55%
     correct and was serving stale `CLAUDE.md`/`MEMORY.md` chunks as if current.
     If semantic search over repo docs is ever wanted again, ingest the selected
     docs into the vault — do not stand up a second index.
4. Do not commit vector databases, embeddings, trace dumps, browser videos or
   heavy screenshot packs. Commit text-first memory docs and small evidence
   manifests.
5. Keep this file aligned with `MEMORY.md`. If product behavior is unclear, ask
   Caleb before inventing rules.

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

---

## 📚 Outros pontos

- **Design canon**: `docs/design-canvas/handoff/cliente/cliente-journey-v20.jsx`
  e `cliente-late-arrival.jsx`. V20 é o source-of-truth — V13/V14 são
  legacy.
- **Late-arrival boundary**: não criar/reintroduzir tool de IA para iniciar
  late-arrival. O fluxo real (e ÚNICO) começa no QR da mesa ocupada:
  `POST /:slug/customer/welcome` (ou `/recognize`) chama
  `TableSessionService.upsertParticipant`, que grava a row em
  `session_participants` com `status='pending'`; o **customer-host da mesa**
  aprova ou rejeita por `POST /:slug/table/participants/decide`, e o resultado
  volta pelo WS `participant:decision` (+ poll de
  `GET /:slug/table/participants`). O próprio solicitante desiste por
  `POST /:slug/table/participants/cancel`.
  **A decisão NUNCA escala pra staff** (decisão de produto V16). O segundo
  sistema que existia pra isso — tabela `late_arrival_requests`, rota
  `POST /:slug/late-arrival-requests`, `escalation_chains` kind `late_arrival`
  e as telas de staff — implementava exatamente a escalada descontinuada,
  tinha ZERO registros nos 4 tenants e era inalcançável pelo app; foi removido
  na **migration 081** (2026-08-31). Não ressuscite: se aparecer necessidade de
  avisar a recepção, é notificação PASSIVA pós-aprovação, não um aprovador
  novo.
- **Customer bootstrap throttles**: `/customer/welcome` usa bucket por IP real
  do peer + table session (default 30/15min, `CUSTOMER_WELCOME_RATE_*`);
  `/customer/identify` permanece 5/IP/15min. Nunca confiar em XFF nesses
  limites.
- **Continuation API**: `services/ai-service/services/continuation.py` ·
  pool de templates por kind. Slots ausentes caem em fallback (round 4
  C-NEW-4) — não revert.
- **Migration runner**: `packages/database/scripts/migrate-tenants.ts`
  aplica migrations novas em tenants existentes via `__migrations__`
  tracking. Wirado no boot da API via docker-compose. Migration 037 é
  idempotente — manter o `DO $$ ... IF NOT EXISTS` pattern em migrations
  novas.
- **Chips canônicos**: tools customer-side de mutação retornam
  `chips: [...]` sempre (round 4 C-NEW-3). Coverage ≥9/10 enforced em
  `tests/test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations`.
- **Carga real dos garçons**: o contrato gerencial vive em
  `GET /:slug/dashboard/team-kpis.waiterWorkload`. A projeção distribui cada
  sessão ativa uma única vez entre candidatos por zona/turno/pausa; não volte a
  multiplicar `occupied_tables` por cada garçom da mesma zona. O alerta
  `manager_staff_workload_imbalance` é singleton com cooldown e manager-only.
  Mapa e drill-down consomem esse mesmo snapshot; normalize o BIGINT/string de
  `tables-overview.number`, filtre `onShift` na seção "em turno" e preserve o
  `slug` ao navegar por ações de alerta.
- **Atraso por estação**: `lateOrders` é kitchen-only enquanto não existir um
  target de bar configurável. Use `order_items.prep_started_at` (migration 078),
  `oi.status='in_progress'` e `mi.kind <> 'drink'`; some `oi.quantity` apenas das
  comidas ativas. Nunca derive o relógio de `orders.updated_at`/history agregado
  nem use os 5 minutos do protótipo como SLA real. O DTO carrega o próprio
  `targetMinutes`; mapa, telas e `waiterWorkload` devem preservar essa mesma
  definição.
- **Identidade customer**: `SessionData.customerId` é compartilhado pela mesa e
  nunca autoriza PII ou ações pessoais. Use `CallerResolverService` com
  `recognition_token`; sem cookie, falhe fechado ou devolva somente conteúdo
  genérico/table-scoped. Exceção de produto temporária (Caleb, 2026-07-11):
  `welcome`/`identify` podem emitir o cookie canônico só com CPF conhecido. Não
  trate isso como auth forte nem como segurança resolvida; preserve rate-limit,
  token fora do body, log mascarado e isolamento tenant.
- **LGPD erasure**: somente o botão out-of-band do browser autenticado chama
  `POST /:slug/lgpd-requests`. Tool-call do LLM jamais apaga. Preserve lease e
  CAS da migration 079, rotação do token, invalidação do cache e desconexão do
  socket após fulfillment.
- **Estados operacionais**: erro/loading não são vazio, tranquilidade ou
  not-found. Preserve dados stale, mostre retry e desabilite toda mutação até
  carregar a entidade autoritativa (QR, chamado, reserva, fila, entregas).
- **KDS por estação**: todo preparo atualiza `order_items`; cook/bartender usam
  kitchen/bar. `/bar` é individual por `staff_token`; `/bar/tv` segue protegido
  por PIN. Não volte a derivar o estágio local só de `orders.status`.
- **Dependências Python**: Docker instala `services/ai-service/requirements.lock`.
  Dependências de teste ficam no `requirements-dev.lock`; regenere os dois para
  Python 3.11 e valide o lock com `pip-audit`.
- **Fechamento do loop 2026-07-11**: leia
  `qa-reports/loop-audit-2026-07-11/FINAL-REPORT.md` antes de reabrir achados.
  O gate final foi 1.597 testes + lint/build forçados + noite Playwright, em
  duas rodadas limpas. No SQL station-scoped, preserve o cast `$1::varchar` no
  `SET status` e no `CASE`; sem ele o PostgreSQL retorna 42P08 apesar dos fakes
  unitários passarem. `/cashier` é holding sem liquidação e Pix é demo. CPF-only
  foi aceito temporariamente e torna o release PARTIAL por risco de takeover;
  a correção futura é OTP em canal verificado ou confirmação presencial, não
  uma mudança silenciosa. Preserve também o cleanup de QRTEST91/92 no `finally`
  do spec da noite; a rodada deve terminar sem estado operacional ativo nas
  mesas de teste.
