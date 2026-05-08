# F5 — Final Validation Report

**Branch:** `claude/adoring-ellis-ec93c3`
**HEAD:** `d665a57` (5 commits since `main`)
**Run date:** 2026-05-08
**Subagent:** F5 · build-lint-types-smoke
**Scope:** end-to-end static + build + contract + integration validation. No code changes.

Commits under test:

| SHA | Subject |
|---|---|
| d665a57 | chore(customer): clean 4 pre-existing lint errors |
| 4d92fed | fix(customer): F4 frontend fixes |
| 5bc1ce6 | fix(db): F1 schema corrections |
| 888ab9b | feat(ai): F2 tool registry alignment |
| 7726f9f | chore(api): F3 backend cleanup |

---

## 1. Static checks

| Workspace | Tool | Exit | Status |
|---|---|---:|---|
| `apps/api` | ESLint (`src/**/*.ts`) | 0 | PASS |
| `apps/api` | `tsc --noEmit` | 0 | PASS |
| `apps/web-customer` | ESLint (`src/**/*.{ts,tsx}`) | 0 | PASS |
| `apps/web-customer` | `tsc --noEmit` | 0 | PASS |
| `apps/web-staff` | ESLint (`src/**/*.{ts,tsx}`) | 0 | PASS |
| `apps/web-staff` | `tsc --noEmit` | 0 | PASS |
| `packages/shared-types` | `tsc --noEmit` | 0 | PASS |
| `services/ai-service` | `pytest tests/ -q` | 0 | PASS — 103 passed in 0.07s |

All 8 static gates green.

---

## 2. Production builds

| Workspace | Build cmd | Exit | Wall-clock | Warnings | Errors |
|---|---|---:|---:|---:|---:|
| `apps/api` | `nest build` | 0 | 2.24s | 0 | 0 |
| `apps/web-customer` | `next build` | 0 | 11.32s | 1 (ESLint plugin notice; benign) | 0 |
| `apps/web-staff` | `next build` | **1** | ~7s | 1 (ESLint plugin notice; benign) | **12** prerender errors |
| `packages/shared-types` | `tsc` | 0 | 0.48s | 0 | 0 |

`web-customer` builds 27 routes cleanly (chunks 87.3 kB shared, all routes within budget).

`web-staff` build **fails** — every prerender error is the same shape:

```
useSearchParams() should be wrapped in a suspense boundary at page "<route>".
```

12 affected routes (all under `/host/**` and `/waiter/**`):
- `/host`, `/host/profile`, `/host/reservations`, `/host/swap`, `/host/waitlist`
- `/waiter`, `/waiter/mensagens`, `/waiter/new-entry`, `/waiter/qr-issue`,
  `/waiter/scan-qr`, `/waiter/scan-qr/picker`, `/waiter/scan-qr/delivery-confirm`

**Pre-existence verification:** `git diff main..HEAD --name-only` shows F1-F4 touched **zero** files under `apps/web-staff/`. The prerender failure is pre-existing on `main` and unrelated to this round of fixes. It is, however, a real deploy blocker for the `web-staff` Next.js app and the orchestrator should treat it as such.

---

## 3. Service contracts smoke

### 3.1 AI tool registry

```
MISSING: []
TOTAL_REGISTERED: 46
CANONICAL_NAMES_EXPORTED: 23
```

All 23 canonical tools listed in the F5 brief resolve in `services.tools.TOOLS`. `CANONICAL_TOOL_NAMES` exports exactly the 23-entry canonical set. Registry total of 46 matches expected (canonical + aliases + helper tools).

### 3.2 `show_lgpd_notice` payload

The function is exported as `call(args, ctx)` (the registry-uniform signature), not as `show_lgpd_notice`. Calling it returns a `ToolResult` with both required fields:

```
LGPD_OK ['message', 'chips'] chips= 2
```

Message preview: `"Você, como consumidor, tem direito por lei (LGPD) de pedir a..."` — canonical text from `lgpd_messages.LGPD_NOTICE`. Two chips (`Sim, quero excluir` / `Não, não quero excluir`), labels mapped to `lgpd_data_request` / `dismiss` actions per `chat-history-lgpd.md`.

PASS — semantic equivalence with the brief; only the surface name (`call` vs `show_lgpd_notice`) differs.

### 3.3 ACK Redis helpers

```
ACK_HELPERS_OK ack:replies
```

`get_ack_reply`, `seed_ack_replies`, `ACK_REPLIES_KEY` all import cleanly from `services.classify_ack`. Redis key constant resolves to `"ack:replies"`.

---

## 4. Migration manifest

```
packages/database/migrations/tenant-template/  (last 10):
  025_create_table_merge_requests.sql
  026_create_complaints_and_order_ratings.sql
  027_create_staff_messages.sql
  028_create_session_flags.sql
  029_assistant_messages_tool_calls.sql
  030_assistant_messages_extends.sql
  031_table_sessions_flags.sql
  032_zone_pauses_refactor.sql
  033_complaints_problem_type.sql
  034_escalation_chains_steps.sql

ADD COLUMN count in 030_assistant_messages_extends.sql: 8
mongo-init.js: present
mongo-init.js TTL indexes (expireAfterSeconds: 0): 2
  - db.chat_threads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  - db.chat_messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

All exact matches with brief expectations.

**Empirical syntax check** (bonus): all 34 tenant-template migrations replayed cleanly into a fresh `smoke_f5` schema on the live `restaurant-postgres` container. Post-030, `assistant_messages` had all 24 expected columns (12 base + 5 from 011/016/019/029 + 7 added by 030: `from_role`, `to_role`, `to_staff_id`, `read_at`, `thread_id`, `kind`, `contextual_chips`). Scratch schema dropped after verification. **Note:** the live DB has no tenant schemas yet — migrations 030-034 will apply when `create-tenant.ts` runs.

---

## 5. Backend integration

| Check | Result |
|---|---|
| `ManagerOnlyGuard` referenced in `zone-pause.controller.ts` | hit |
| `ManagerOnlyGuard` referenced in `complaints.controller.ts` | hit |
| `ManagerOnlyGuard` referenced in `vip.controller.ts` | hit |
| `EventsGateway.emitStaffMessageRead()` defined | line 651 of `events.gateway.ts` |
| `staff-messages.service.ts` calls `emitStaffMessageRead` | line 170 |
| `@Delete(':id')` alias on zone-pause controller | line 128 of `zone-pause.controller.ts` |

All checks green.

---

## 6. Frontend integration

| Check | Result |
|---|---|
| `cManagerArrive` defined in `lib/animations.ts` | lines 52, 66 |
| `cManagerArrive` consumed by `ManagerBubble.tsx` | lines 4, 129, 134 |
| `apps/web-customer/src/hooks/useTableMerge.ts` | present |
| `ManagerChipActionKind` exported by `ManagerBubble.tsx` | lines 18, 44, 58, 64 |
| `ManagerChipActionKind` re-exported from `components/ui/index.ts` | line 37 |
| `view_menu` / `add_to_order` / `show_lgpd_notice` referenced in `assistente/page.tsx` | multiple lines (39, 67, 107, 293, 297, 339) |

All checks green. Note: `add_to_order` is referenced by name only (server-side handles it). `view_menu` and `show_lgpd_notice` are dispatched (one inline, one stubbed — see §8).

---

## 7. Docker smoke

Docker daemon **was** running. Containers already up at start of run:
- `restaurant-postgres` (postgres:16, port 5434, healthy)
- `restaurant-redis` (redis:7, port 6380, healthy)
- `restaurant-mongodb` (mongo:7, port 27017, healthy)

**What was attempted:**
1. Listed schemas → only `public` exists, 4 tables (`admin_users`, `ai_usage_daily`, `plans`, `restaurants`). No tenants seeded.
2. Identified migrate scripts: only `migrate:public` and `migrate` exist; both run `migrations/public/`. No standalone tenant-migration runner — tenant migrations are bundled into `create-tenant.ts`.
3. To validate the new tenant migrations 030-034 without spinning up a tenant, replayed all 34 tenant-template files against a scratch `smoke_f5` schema. **All applied cleanly.** Schema dropped after.

**What was skipped:**
- Live E2E flows (per brief).
- Running `create-tenant.ts` end-to-end (would mutate global state for a verification).
- API/web-customer/web-staff service start-up in containers.

**Net:** services healthy, migrations syntactically valid. Live tenant migration application requires the user to run `create-tenant.ts` (or update an existing tenant) post-deploy.

---

## 8. Residual issues

### Critical (deploy blocker for that workspace)
- **`apps/web-staff` build fails (12 prerender errors).** Pre-existing on `main`; NOT introduced by F1-F4. Caused by `useSearchParams()` calls without `<Suspense>` wrappers across `/host/**` and `/waiter/**` route segments. Either wrap each page's `useSearchParams` consumer in `<Suspense>` or set `export const dynamic = 'force-dynamic'` on the affected pages.

### Documented stubs (intentional, follow-up tracked)
- **Customer app stubbed tools (13).** `apps/web-customer/src/app/[slug]/assistente/page.tsx:338-352` keeps a `Set` of tool names that render a generic "OK" bubble + console-warn instead of running real UX. Stubs are: `view_menu`, `search_dish`, `check_allergens`, `compare_dishes`, `view_order`, `split_bill`, `pay_individual`, `pay_full`, `open_payment_screen`, `delete_chat`, `delete_all_chats`, `view_courtesy`, `ask_about_restaurant`. In-file comment cites C5/C6 as the follow-up rounds. Functional impact: chat won't crash on any canonical tool; UX for those 13 tools is text-only via the LLM response.
- **`apps/api/src/modules/zone-pause/zone-pause.service.ts:63`** — `TODO(payload): waiterName needs a join with staff. We pass the id` for now. Not a blocker, but the WS payload to clients includes a staff id where a name is preferred.

### Other notes
- ESLint plugin warning ("The Next.js plugin was not detected in your ESLint configuration") fires once per Next.js workspace. Cosmetic; doesn't affect lint or build.
- Migrations 030-034 are dormant on the live dev DB — no tenant schemas exist yet. First `create-tenant` after deploy will apply them.

---

## 9. Manual smoke checklist (user's checkpoint)

Per orchestrator brief — these are **not** run in this validation. The user should execute them on a freshly deployed staging environment before promoting to prod.

- [ ] flow 1 — Customer journey: scan QR → identify → assistant chat → LGPD chip flow → table merge request → pay split
- [ ] flow 2 — Manager: receive complaint, escalate, send manager message to customer; verify ManagerBubble arrives with `cManagerArrive` animation
- [ ] flow 3 — Waiter: see waiter call, mark resolved, post-meal message, read-receipt WS roundtrip
- [ ] flow 4 — Host: late-arrival approval, table-merge approval, swap workflow
- [ ] flow 5 — VIP layer: mark customer VIP, verify ManagerOnlyGuard rejects non-manager calls (403)
- [ ] flow 6 — Zone pause: open/close zone, verify DELETE alias removes pause, verify only manager allowed
- [ ] flow 7 — AI assistant: full LGPD erasure flow (`show_lgpd_notice` → consent chip → `lgpd_data_request`); verify ACK Redis pool hits

---

## 10. GO / NO-GO recommendation

**Recommendation: GO with one carve-out.**

**Justification.** Every change introduced by F1-F4 passes static checks, builds, tool-registry contract verification, migration replay, backend integration grep, and frontend integration grep. The AI service test suite is fully green (103/103). The five tenant migrations (030-034) replay cleanly into a fresh schema. All required guards (`ManagerOnlyGuard`), WS events (`emitStaffMessageRead`), and FE wiring (`cManagerArrive`, `useTableMerge`, `ManagerChipActionKind`, stubbed tool dispatch) are present and reachable. The lone build failure — `apps/web-staff` prerender errors on 12 `/host` and `/waiter` routes — is **pre-existing on `main`** and outside the scope of F1-F4. It is a real deploy blocker for the `web-staff` deployable artifact, but it is not regression and has no bearing on whether this PR should merge.

**Carve-out:** before deploying the `web-staff` app to prod, fix the `useSearchParams()` suspense boundary issue across the 12 affected routes (or set those pages to `dynamic = 'force-dynamic'`). The `apps/api`, `apps/web-customer`, AI service, and database changes are all green and ready.

**Manual smoke (§9) remains the user's gate** before prod promotion.
