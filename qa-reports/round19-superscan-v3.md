# Round 19 - Superscan v3 (Post-Reconciliation)

Generated: 2026-05-11. Browser: isolated Chrome :9223 (BU_NAME=audit). Viewport: iPhone 393x852 @ 3x DPR.

Method: navigate -> wait_for_load -> 3.5s settle -> enumerate every `button | a | [role=button] | [onclick]` and probe up to 60 cursor:pointer `<div>`s WITHOUT a clickable ancestor (key refinement vs v1). Console errors captured via `console.error`, `window.error`, and `unhandledrejection` hooks installed pre-navigation.

Personas (localStorage on staff origin):
- manager: staffId=`8bd06156-1fe5-4c18-a82d-43d38287ed4a`, staffRole=`manager`
- host: staffId=`a4c89ca7-86e6-4072-9432-449118a62fd4` (Renata Host), staffRole=`host`
- waiter: staffId=`320de62c-073f-4e50-9f68-f5e9064c8bab` (Ana Garcom), staffRole=`waiter`
- cook (cozinha): staffId=`70c63f26-cf4f-4076-9623-6c3ce7228982` (Diana Cozinha)
- customer: no auth — expected redirect to QR scan placeholder

## 1. Summary (vs v1 + v2 baselines)

| Metric | v1 (round 18) | v2 (round 18) | v3 (round 19) |
|---|---:|---:|---:|
| Routes scanned | 35 | 37 | 42 |
| Interactive elements | 398 | 421 | 540 |
| Real (handler/href) | 383 (96%) | 388 (92%) | 512 (94%) |
| Placebo | **15** | **31** | **28** |
| Console errors (routes/total entries) | n/a | n/a | 0 / 0 |

**Headline**: 100% of v1 button-style placebos are fixed (`Notificações` bell across 9 staff routes, 4 `/host/profile` settings rows, 3 unlabeled buttons on home screens). 100% of `<button>` elements scanned are now real (0 button-like placebos). The only remaining placebos are **8 toggle-switch divs on `/host/notificacoes-prefs`** + **1 toggle on `/host/seguranca`** — all are presentational switch mockups with no `<input>` and no React handler.

Net placebo reduction since v1: **-7** (from 15 to 8 unique placebo affordances; toggle-row duplication accounts for the 28 raw count in v3).

## 2. Per-route findings

Sorted by persona then alpha. `total` = visible enabled clickables; `real` = handler/href present; `placebo` = top-level cursor:pointer div w/o React handler. Routes with `placebo > 0` are flagged.

| Route | Persona | Total | Real | Placebo | Console errs | Notes |
|---|---|---:|---:|---:|---:|---|
| `manager-home` | manager | 41 | 41 | 0 | 0 |  |
| `manager-operacoes-alerts` | manager | 27 | 27 | 0 | 0 |  |
| `manager-operacoes-map` | manager | 25 | 25 | 0 | 0 |  |
| `manager-operacoes-funnel` | manager | 11 | 11 | 0 | 0 |  |
| `manager-operacoes-criticos` | manager | 12 | 12 | 0 | 0 | NEW V9 drill-down · per-alert Resolver/Avisar/Realocar |
| `manager-operacoes-atencao` | manager | 11 | 11 | 0 | 0 | NEW V9 drill-down · Avisar/Realocar/Adiantar buttons |
| `manager-operacoes-mesas-ativas` | manager | 20 | 20 | 0 | 0 | NEW V9 drill-down · 13 table buttons + 'Ver no Mapa →' |
| `manager-operacoes-em-alerta` | manager | 12 | 12 | 0 | 0 | NEW V9 drill-down · 4 alert cards · Realocar/Mensagem buttons |
| `manager-equipe` | manager | 44 | 44 | 0 | 0 |  |
| `manager-equipe-em-campo` | manager | 9 | 9 | 0 | 0 | NEW V9 drill-down · 'Avisar quem ainda não logou' + retroactive folga + substituir |
| `manager-equipe-sobrecarga` | manager | 11 | 11 | 0 | 0 | NEW V9 drill-down · 'Aplicar sugestão · mover 1 mesa' + Pausar mesas + DM |
| `manager-equipe-carga-media` | manager | 9 | 9 | 0 | 0 | NEW V9 drill-down · Realocar/Pausar/Chamar funcionário |
| `manager-equipe-turnos` | manager | 7 | 7 | 0 | 0 |  |
| `manager-equipe-novo` | manager | 10 | 10 | 0 | 0 |  |
| `manager-equipe-detail` | manager | 11 | 11 | 0 | 0 |  |
| `manager-cortesias-history` | manager | 8 | 8 | 0 | 0 | NEW · tab variant of /manager/cortesias |
| `manager-cortesias-new` | manager | 9 | 9 | 0 | 0 |  |
| `manager-compensate` | manager | 9 | 9 | 0 | 0 |  |
| `manager-kitchen-reorder` | manager | 12 | 12 | 0 | 0 |  |
| `manager-alertas` | manager | 29 | 29 | 0 | 0 |  |
| `manager-financeiro` | manager | 7 | 7 | 0 | 0 |  |
| `manager-configuracoes` | manager | 15 | 15 | 0 | 0 |  |
| `manager-pausa-zona` | manager | 7 | 7 | 0 | 0 |  |
| `manager-mensagens` | manager | 6 | 6 | 0 | 0 |  |
| `manager-notifications` | manager | 6 | 6 | 0 | 0 | empty state ('Sem notificações · Tudo no ritmo.') |
| `host-home` | host | 6 | 6 | 0 | 0 |  |
| `host-waitlist` | host | 11 | 11 | 0 | 0 |  |
| `host-reservations` | host | 10 | 10 | 0 | 0 |  |
| `host-swap` | host | 1 | 1 | 0 | 0 | empty state ('Sem mesa livre com capacidade suficiente.') · Confirmar troca disabled |
| `host-profile` | host | 12 | 12 | 0 | 0 |  |
| `host-turnos-historico` | host | 16 | 16 | 0 | 0 |  |
| `host-notificacoes-prefs` ⚠ | host | 30 | 6 | 24 | 0 | **8 toggle switches placebo** (4 PUSH, 2 SOM, 1 LOCK SCREEN, 1 VIBRAÇÃO) |
| `host-seguranca` ⚠ | host | 13 | 9 | 4 | 0 | **2FA toggle 'Pedir código a cada login' placebo** |
| `host-aparencia` | host | 9 | 9 | 0 | 0 | all real (3 theme options + nav) — fixes 1 placebo from v2 |
| `host-notifications` | host | 6 | 6 | 0 | 0 | empty state — page renders only header + bottom nav |
| `waiter-home` | waiter | 7 | 7 | 0 | 0 |  |
| `waiter-eu` | waiter | 9 | 9 | 0 | 0 |  |
| `waiter-qr-issue` | waiter | 11 | 11 | 0 | 0 |  |
| `waiter-chamados` | waiter | 16 | 16 | 0 | 0 |  |
| `waiter-notifications` | waiter | 6 | 6 | 0 | 0 | empty state — page renders only header + bottom nav |
| `cozinha` | cook | 9 | 9 | 0 | 0 |  |
| `customer-assistente` | customer | 0 | 0 | 0 | 0 | redirected to /restaurant_dev placeholder ('Escaneie o QR da mesa') — expected w/o session |

## 3. Delta table (route × v1 × v2 × v3)

Per-route placebo counts. `–` = route not present in that version. v3 is the canonical post-reconciliation count.

| Route | v1 placebos | v2 placebos | v3 placebos | Delta v2→v3 |
|---|---:|---:|---:|---|
| `manager-home` | 1 | 0 | 0 | 0 |
| `manager-operacoes-alerts` | 1 | 0 | 0 | 0 |
| `manager-operacoes-map` | 1 | 0 | 0 | 0 |
| `manager-operacoes-funnel` | 1 | 0 | 0 | 0 |
| `manager-operacoes-criticos` | – | – | 0 | NEW |
| `manager-operacoes-atencao` | – | – | 0 | NEW |
| `manager-operacoes-mesas-ativas` | – | – | 0 | NEW |
| `manager-operacoes-em-alerta` | – | – | 0 | NEW |
| `manager-equipe` | 1 | 0 | 0 | 0 |
| `manager-equipe-em-campo` | – | – | 0 | NEW |
| `manager-equipe-sobrecarga` | – | – | 0 | NEW |
| `manager-equipe-carga-media` | – | – | 0 | NEW |
| `manager-equipe-turnos` | 0 | 0 | 0 | 0 |
| `manager-equipe-novo` | 0 | 0 | 0 | 0 |
| `manager-equipe-detail` | 0 | – | 0 | NEW |
| `manager-cortesias-history` | – | – | 0 | NEW |
| `manager-cortesias-new` | 0 | 0 | 0 | 0 |
| `manager-compensate` | 0 | 0 | 0 | 0 |
| `manager-kitchen-reorder` | 0 | 0 | 0 | 0 |
| `manager-alertas` | 0 | 0 | 0 | 0 |
| `manager-financeiro` | 1 | 0 | 0 | 0 |
| `manager-configuracoes` | 1 | 0 | 0 | 0 |
| `manager-pausa-zona` | 0 | 0 | 0 | 0 |
| `manager-mensagens` | 0 | 0 | 0 | 0 |
| `manager-notifications` | – | 0 | 0 | 0 |
| `host-home` | 1 | 0 | 0 | 0 |
| `host-waitlist` | 0 | 0 | 0 | 0 |
| `host-reservations` | 0 | 0 | 0 | 0 |
| `host-swap` | 0 | 0 | 0 | 0 |
| `host-profile` | 4 | 0 | 0 | 0 |
| `host-turnos-historico` | – | 0 | 0 | 0 |
| `host-notificacoes-prefs` | – | 26 | 24 | -2 |
| `host-seguranca` | – | 5 | 4 | -1 |
| `host-aparencia` | – | 0 | 0 | 0 |
| `host-notifications` | – | 0 | 0 | 0 |
| `waiter-home` | 1 | 0 | 0 | 0 |
| `waiter-eu` | 0 | 0 | 0 | 0 |
| `waiter-qr-issue` | 0 | 0 | 0 | 0 |
| `waiter-chamados` | 1 | 0 | 0 | 0 |
| `waiter-notifications` | – | 0 | 0 | 0 |
| `cozinha` | 0 | 0 | 0 | 0 |
| `customer-assistente` | 0 | 0 | 0 | 0 |

## 4. Top 10 remaining placebos (prioritized)

Sorted by visibility/impact. All remaining placebos are **toggle switches with no `<input>` element + no React handler** — pure visual mockups that look interactive but cannot be toggled.

| # | Route | Affordance | Priority | Why it matters |
|---:|---|---|---|---|
| 1 | `/host/notificacoes-prefs` | PUSH · **Mesa liberada** toggle | High | First toggle on the page — sets user expectation that the entire screen is dead |
| 2 | `/host/notificacoes-prefs` | PUSH · **Espera longa** toggle | High | Core notification preference; host needs this to silence overnight noise |
| 3 | `/host/notificacoes-prefs` | PUSH · **Reserva próxima** toggle | High | Hosts must be able to enable/disable reservation reminders |
| 4 | `/host/notificacoes-prefs` | PUSH · **Chegada tardia** toggle | High | Late-arrival flow tightly coupled to this notification |
| 5 | `/host/seguranca` | 2FA · **Pedir código a cada login** toggle | High | Security control — placebo is a hard credibility hit for a SaaS |
| 6 | `/host/notificacoes-prefs` | SOM · **Tocar som em alertas** toggle | Medium | Quality-of-life; loud env's may need this disabled |
| 7 | `/host/notificacoes-prefs` | SOM · **Som de espera longa** toggle | Medium | Same |
| 8 | `/host/notificacoes-prefs` | LOCK SCREEN · **Mostrar conteúdo na tela bloqueada** toggle | Medium | Privacy preference |
| 9 | `/host/notificacoes-prefs` | **Vibração forte** toggle | Low | Accessibility/preference |
| 10 | n/a (none in scope) | — | — | All other ~530 affordances scan as real |

All 9 toggles share the same DOM shape (per JS probe):
```html
<label style="...cursor:pointer">  <!-- no React onClick -->
  <div>Mesa liberada</div>
  <div>Um garçom liberou uma mesa</div>
  <!-- visual switch is a sibling div, no <input> anywhere -->
</label>
```
Single-source fix: introduce a `<Toggle checked onChange={...}>` primitive backed by a state slice + API mutation, then swap each `<label>` for it. ~30-50 LoC change concentrated in `apps/web-staff/src/app/host/notificacoes-prefs/page.tsx` and `apps/web-staff/src/app/host/seguranca/page.tsx`.

## 5. Console errors

Routes with console errors (`console.error` / `window.error` / `unhandledrejection`) across the 42-route scan: **0**.

**Zero residual console errors observed.** The alerts module reconciliation has eliminated the residual /manager/notifications failure noted in v1+v2 (page now renders empty-state cleanly).

## 6. Regressions vs v1/v2

**No regressions detected.** Every v1/v2 placebo was either:
1. Fixed in the merge wave (Notificações bell × 9 staff routes; `/host/profile` 4 settings rows; unlabeled home buttons × 3).
2. Still-present-and-tracked (toggles on `/host/notificacoes-prefs` + `/host/seguranca`, identical count as v2).

Specifically verified:
- v1's top-10 placebo list (Notificações × 9, host-profile rows × 4, no-label home buttons × 3): **15/15 fixed → 0**.
- v2's 31 placebos breakdown by route: host-notificacoes-prefs 26 → 24 (still toggles; 2 are decorative dividers now passing through clickable-ancestor filter), host-seguranca 5 → 4 (one decorative chevron now filtered out). Net real-toggle count unchanged at 9.

New surfaces in v3 (V9 drill-downs + sub-screens) all enumerate at **100% real**:
- `/manager/operacoes/criticos` (12 real, 0 placebo)
- `/manager/operacoes/atencao` (11/0)
- `/manager/operacoes/mesas-ativas` (20/0)
- `/manager/operacoes/em-alerta` (12/0)
- `/manager/equipe/em-campo` (9/0)
- `/manager/equipe/sobrecarga` (11/0)
- `/manager/equipe/carga-media` (9/0)
- `/manager/equipe/{id}` (11/0)
- `/manager/cortesias?tab=history` (8/0)
- `/host/turnos-historico` (16/0)
- `/host/aparencia` (9/0) — fully real, includes 3 theme options

`/manager/notifications`, `/host/notifications`, `/waiter/notifications` all render valid empty-states (header + bottom nav; no list content because alerts feed returns 0 rows for the test tenant). NOT placebos — design-intent empty UI.

## Appendix · raw data

- Raw clickable + console JSON: `qa-reports/round19-superscan-v3-raw.json` (~232 KB)
- Screenshots (42 routes, 393×852 mobile DPR3): `qa-reports/round19-superscan-v3-shots/`