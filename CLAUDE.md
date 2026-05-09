# CLAUDE.md — Project guidance for AI assistants

Instructions for any AI agent (Claude Code, codex, etc.) operating on this
repository. **READ FIRST** before making changes.

---

## 🔒 V20 Customer UI · DO NOT MODIFY

The customer-facing surfaces below were **hand-designed by the project owner
in Round 4** as part of the V20 design language. Visual decisions (spacing,
typography, layout, copy, color tokens) are intentional and were validated
side-by-side via Playwright preview iterations. **Treat these files as
locked unless the user explicitly asks for changes.**

### Locked files (visual + layout)

| File | What it owns |
|---|---|
| [apps/web-customer/src/components/welcome/WelcomeModal.tsx](apps/web-customer/src/components/welcome/WelcomeModal.tsx) | Welcome flow · mono eyebrow `MESA N · BEM-VINDO`, title 26/700 "Pra começar, quem é você?", FieldShell pattern, helper mono uppercase, PillButton filled com seta canon. Centralizado via `grid place-items-center` em `h-[100dvh]`. Inputs com label "Seu nome" / "Seu CPF" |
| [apps/web-customer/src/components/welcome/CpfInput.tsx](apps/web-customer/src/components/welcome/CpfInput.tsx) | CPF input "naked" — NÃO gerencia próprio border; sinaliza `onFocusChange` pro shell pai. Não readicionar border/padding aqui |
| [apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx](apps/web-customer/src/screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx) | Late-arrival identify · mesmo canon do WelcomeModal (eyebrow + title + FieldShell + helper + CTA). Label canon: **"Seu nome"** (não "Seu primeiro nome") |
| [apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx](apps/web-customer/src/screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx) | Waiting screen · bloco unificado eyebrow→title→sub→ícone→pill→CTA centralizado. Sem `flex-1` spacer empurrando CTA pro bottom |
| [apps/web-customer/src/components/ui/CallWaiterSheet.tsx](apps/web-customer/src/components/ui/CallWaiterSheet.tsx) | Bottom-sheet vaul-style para `call_waiter` · 5 motivos canon V20 (Trazer cardápio · Fazer pedido · Servir bebida · Pedir conta · Outro motivo) com icon+label+sub. Drag full-area via pointer events + `touch-action: pan-y` |
| [apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx](apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx) (linhas do `reclaimBanner`) | Reclaim banner · V20 canon discreet hint (`border-soft + bg-surface + mono eyebrow CONTA RECONHECIDA`). NÃO voltar pro amber/yellow |
| [apps/web-customer/src/app/[slug]/assistente/page.tsx](apps/web-customer/src/app/[slug]/assistente/page.tsx) (landing branch `!chatStarted`) | Landing /assistente · home-like (2 PillButtons grandes "Chamar garçom" + "Ver cardápio" + `HomeHero` com greeting da continuation API). Bubbles de chat só aparecem após 1ª msg do customer; greeting vira o 1º AI bubble preservando contexto |

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
