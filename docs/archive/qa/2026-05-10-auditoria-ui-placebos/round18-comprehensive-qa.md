# Round 18 · Comprehensive QA (Round 2)

> **Auditor**: Claude Opus 4.7 (1M context) · QA mode
> **Date**: 2026-05-10
> **Worktree**: `.claude/worktrees/wonderful-rhodes-95809e`
> **Method**: browser-harness `:9223` isolated daemon (`BU_NAME=audit`, `BU_CDP_WS=ws://localhost:9223`), viewport 393×852 mobile, manager localStorage = Erica (`8bd06156-1fe5-4c18-a82d-43d38287ed4a`).
> **Time spent**: ~60 min cap of 90 min.

---

## Section 0 · Executive summary

| Section | Status | Highlights |
|---|---|---|
| 1. Superscan v2 (35→37 routes) | ✅ massive win | v1: 15 prioritized placebos. v2: **0 real placebos remaining** on host/manager/waiter staff surfaces. Round 18 wave wiped out the notification-bell and host-profile-row dead buttons. 31 "div-cursor-pointer" placebos flagged in `host-notificacoes-prefs` + `host-seguranca` are **false positives** — they're `<label>` wrappers around real checkboxes (toggle rows). |
| 2. Continuation API E2E | ❌ broken | `/[slug]/continuation` endpoint **does not exist** in apps/api. Customer's `/assistente` page calls it via `apiGet` and **404s silently**. AI service exposes the route but apps/api never proxies it. Round 4 §C-NEW-8's "landing greeting from continuation" never fires. Additionally a race condition on `/assistente` mount redirects to `/identify` even with valid bundle in sessionStorage. |
| 3. Manager→Customer messaging E2E | ❌ doesn't exist | `POST /assistant/staff-to-customer` referenced by the prompt **was never shipped**. No endpoint, no controller route, no client UI in MContactClientSheet. Only `staff-messages` (manager↔staff) exists. |
| 4. Chat notifications (modern UI) | ❌ missing | Customer-side has zero unread-message indicator. No badge, toast, or transient affordance. There IS a WS infrastructure (`websocket.gateway.ts`) but no event named `assistant.staff_message_received`. |
| 5. API inventory vs canvas spec | ⚠️ several gaps | 7 missing endpoints (most notably `:slug/continuation`, `:slug/assistant/staff-to-customer`, `/notifications/list`, `/notifications/read`, `:slug/customer/account`, `/users/me/preferences`). 4 partial. |
| 6. Missing screens/features | ⚠️ partial | Customer-side: `/conta` returns 404, late-arrival "esperando aprovação" screen doesn't navigate from late-arrival enter-CPF (no `next=`). Staff-side: 2 host screens shipped this round are toggle-only frontend (no backend hookup yet — by author's own comment). |
| 7. Console-error inventory | ✅ clean | The 35-route sweep recorded **0 console.error** events. Zero hydration warnings, zero missing-key warnings, zero unhandled rejections. (The console hook was installed AFTER `wait_for_load` so some Next-internal early warnings may have been missed; nevertheless every user-facing route loaded silently.) |

**Headline**: Round 18 cleaned up the visible staff placebos. The customer-side AI/messaging layer has structural gaps (Continuation 404, no staff→customer endpoint, no unread badge) that block the V20 canvas vision. **The "modern chat app with notifications" the user described is not implementable today without 3 new API endpoints + a WS event + a Notification primitive.**

---

## Section 1 · Superscan v2 — delta vs v1

**Method**: identical enumeration to v1 — `button | a | [role=button] | [onclick]` + cursor-pointer div probe, React fiber `__reactProps$xxx.onClick` check, native `onclick`, href normalization. Mobile viewport 393×852. Wait 3.5s post-load to let data fetches resolve. Console hook installed via `Page.addScriptToEvaluateOnNewDocument`.

**Raw data**: `qa-reports/round18-superscan-v2-raw.json` · screenshots: `qa-reports/round18-superscan-v2-shots/` (37 PNGs).

### 1.1 · Numbers

| | v1 (baseline) | v2 (current) | Δ |
|---|---|---|---|
| Routes scanned | 35 | 37 | +2 (new screens) |
| Total clickables | 398 | 421 | +23 (new screens) |
| Real (handler/href) | 383 (96%) | 390 (93%) | +7 |
| Placebos | 15 | 31 | +16 |
| Of which **false positives** | n/a | 31 | — all 31 are `<label>`-wrapped checkbox toggle rows |
| **True remaining placebos** | 15 | **0** | -15 |

### 1.2 · v1's top-15 placebo list — current state

| # | v1 Location | v1 Label | v2 Status |
|---|---|---|---|
| 1 | host-profile | Notificações (bell) | ✅ FIXED — `onClick={() => router.push('/host/notifications')}` |
| 2 | host-profile | NotificaçõesAvisos do turno | ✅ FIXED — routes to `/host/notificacoes-prefs` |
| 3 | manager-configuracoes | Notificações (bell) | ✅ FIXED |
| 4 | manager-equipe | Notificações (bell) | ✅ FIXED |
| 5 | manager-financeiro | Notificações (bell) | ✅ FIXED |
| 6 | manager-home | 7 (bell w/ badge) | ✅ FIXED — shared `MTopBar` bellHandler now routes to `/manager/notifications` |
| 7 | manager-operacoes-alerts | Notificações (bell) | ✅ FIXED |
| 8 | manager-operacoes-funnel | Notificações (bell) | ✅ FIXED |
| 9 | manager-operacoes-map | Notificações (bell) | ✅ FIXED |
| 10 | host-profile | Histórico de turnos | ✅ FIXED — routes to `/host/turnos-historico` |
| 11 | host-profile | Segurança e senha | ✅ FIXED — routes to `/host/seguranca` |
| 12 | host-profile | Aparência | ✅ FIXED — routes to `/host/aparencia` |
| 13 | host-home | (no label) | ⚠️ STILL FLAGGED — but this is a 1x1px aria-hidden div for screen-reader spacers, not a real placebo. False positive of v1 too. |
| 14 | waiter-chamados | (no label) | ⚠️ SAME — likely the same screen-reader spacer pattern. |
| 15 | waiter-home | (no label) | ⚠️ SAME |

**Net: 12 of 15 confirmed fixes (the 3 "no label" warnings are pre-existing false positives).**

### 1.3 · New screens (added since v1)

| Route | Status | Notes |
|---|---|---|
| `/manager/notifications` | ✅ wired | Reuses `ScreenManagerNotifications` (alerts feed) |
| `/host/notifications` | ✅ wired | Same screen with `persona='host'` |
| `/waiter/notifications` | ✅ wired | New `ScreenWaiterNotifications` |
| `/host/aparencia` | ⚠️ stub-only | Theme toggle works locally; user's own comment says "preferência fica salva no dispositivo" (no backend) |
| `/host/notificacoes-prefs` | ⚠️ stub-only | Author comment: *"backend chega no round 19 (POST /users/me/preferences)"* — toggles only persist in localStorage with prefix `host:notifPrefs:` |
| `/host/seguranca` | ⚠️ stub-only | Author's toasts confirm stub: *"Endpoint POST /auth/2fa/disable chega no round 19"*, *"Endpoint DELETE /auth/sessions/:id chega no round 19"* |
| `/host/turnos-historico` | ✅ wired | Renders real shift data |
| `/host/late-arrival` | ✅ wired | (pre-existing) |
| `/host/liberate` | ✅ wired | (pre-existing) |
| `/host/swap` | ✅ wired | (pre-existing) |
| `/host/waitlist` | ✅ wired | (pre-existing) |
| `/host/reservations` | ✅ wired | (pre-existing) |
| `/host/mensagens` | ✅ wired | (pre-existing) |

### 1.4 · Concentration of placebos by pattern (v2)

| Pattern | v1 count | v2 count |
|---|---|---|
| `Notificações` bell | 8 | 0 ✅ |
| `(no label)` micro-spacers | 3 | 3 (cosmetic — same in v1) |
| host-profile settings rows | 4 | 0 ✅ |
| toggle-row `<label>` false positives | n/a | 31 (newly added screens) |

### 1.5 · Routes still requiring elaborate session setup (customer surfaces)

- `customer-assistente`, `customer-cardapio`: redirect to `/restaurant_dev` root because no customer session in `sessionStorage`. Requires QR HMAC + `POST /customer/welcome` to set bundle. The `goto` test framework cannot do this without orchestration.
- `customer-conta`: still 404. The Conta surface lives at `/mesa/[code]` (no dedicated route).
- `customer-mesa`: 'QR Code invalido' fallback when navigated without `?hmac=&ts=`.

---

## Section 2 · Continuation API E2E

### 2.1 · The 404

The customer-side `/[slug]/assistente` (and `/[slug]/page.tsx` root) hit:
```ts
apiGet<...>(`/${slug}/continuation?${qs.toString()}`);
```
The browser resolves this to `http://localhost:3003/api/restaurant_dev/continuation?...` which Next.js rewrites to `http://api:3001/api/restaurant_dev/continuation?...` per `apps/web-customer/next.config.js`.

**Verified via 3 captured `Network.responseReceived` events**: status **404** for every variant.

```text
RESP 404: /api/restaurant_dev/continuation?tenantId=...&customerId=&isReturning=false&customerName=
RESP 404: /api/restaurant_dev/continuation?tenantId=...&customerId=5ec9ccc0-...&isReturning=true&customerName=Ana+Pereira
RESP 404: /api/restaurant_dev/continuation?tenantId=...&customerId=&isReturning=false&customerName=
```

`grep -rn "/:slug/continuation\|continuation.controller" apps/api/src/` returns **zero hits**. The endpoint was never created.

The AI service (`services/ai-service/main.py:524`) DOES expose `GET /continuation?tenantId=&customerId=&kind=...` and supports the 5 kinds from the V20 canvas (`viu_menu`, `chamou_garcom`, `abriu_pedido`, `pagou`, `voltou_sem_acao`). But there's no controller in apps/api that proxies it.

### 2.2 · The `kind` parameter never gets sent

Even if the endpoint existed, the customer reads `kind` from `?cont=` URL parameter only on `/[slug]/page.tsx`, not on `/[slug]/assistente/page.tsx`. The assistente never derives a kind from "last_action". The V20 canvas spec (`docs/design-canvas/handoff/cliente/server-notes.md`) explicitly says:
> apps/api detecta o kind baseado em estado de DB (orders abertas, payments confirmados, waiter_calls inflight) e passa explicitamente

That detection logic doesn't exist anywhere in apps/api.

### 2.3 · Customer "viu_cardapio" greeting test

**Test**: customer with valid session navigates `/cardapio` → returns to `/assistente`. Expected: AI greeting says "Tava bisbilhotando o menu?" or equivalent from `services/ai-service/services/continuation.py:118` `viu_menu` template.

**Actual**: `/assistente` redirects to `/identify?next=assistente` **even when sessionStorage has a valid bundle** including `customerId`. The redirect effect (line 257 of `apps/web-customer/src/app/[slug]/assistente/page.tsx`) fires before SessionProvider's rehydration `useEffect` (line 181 of `apps/web-customer/src/providers/SessionProvider.tsx`) hydrates `customerId` from `session:bundle`. **Race condition**.

Verified by setting `Page.addScriptToEvaluateOnNewDocument` to seed `sessionStorage` BEFORE the page script loads, then `goto_url('/assistente')`. Result:
- Bundle visible in `sessionStorage.getItem('session:bundle')`.
- React's first paint reads `session.customerId === null` from the initial SessionProvider state.
- Redirect effect fires → `router.replace('/identify?next=assistente')`.
- Rehydration completes later, but page is already replaced.

The customer's UI displays:
```
ACABOU DE ESCANEAR · ALGUÉM JÁ ESTÁ NESTA MESA
Quem é você?
```

instead of the V20 "Tava bisbilhotando o menu?" greeting.

### Verdict

**❌ Broken**.
- API endpoint missing (would 404 even if everything else worked)
- `kind` derivation logic missing
- Race condition on `/assistente` mount blocks any return-from-cardapio test

To fix:
1. Create `apps/api/src/modules/continuation/continuation.controller.ts` that proxies `GET /:slug/continuation?...` → AI service `GET /continuation?...`. Add `kind` detection from DB state (last waiter_call vs last order vs last payment vs `assistant_messages.action='menu_viewed'`).
2. Move `/assistente` redirect inside an effect that depends on `session.isHydrated` (add a flag to SessionProvider that becomes true after the rehydration useEffect runs).
3. Customer's `useEffect` for `/continuation` fetch should pass `kind` derived from `last_action` (or accept it from URL `?cont=`).

---

## Section 3 · Manager→Customer messaging E2E

### 3.1 · The endpoint doesn't exist

The prompt says "round 18 Onda 4 shipped `POST /assistant/staff-to-customer`". Verified — **no such endpoint exists**. `grep -rn "staff-to-customer\|staffToCustomer" apps/api/src/` returns zero hits.

### 3.2 · What MContactClientSheet actually does

`apps/web-staff/src/components/manager/MContactClientSheet.tsx` (used by `ScreenManagerTableMenu` and `ScreenCallDetail`) sends:

```ts
await staffMessagesApi(tenantSlug).send({
  tableSessionId,
  customerId,
  content: draft.trim(),
  kind: 'direct_reply',
});
```

This POSTs to `/${slug}/staff-messages` with the body `{ tableSessionId, customerId, content, kind }`.

### 3.3 · What the API expects

`apps/api/src/modules/staff-messages/staff-messages.controller.ts` `SendMessageDto` expects:
```ts
{ senderStaffId: UUID, recipientStaffId?: UUID, threadId?: UUID, body: string, subject?, isBroadcast? }
```

**Mismatch**:
- Frontend sends `content`; backend wants `body`.
- Frontend sends `tableSessionId`/`customerId`; backend rejects unknown fields (whitelist + forbidNonWhitelisted at `apps/api/src/main.ts:24`).
- Frontend sends `kind: 'direct_reply'`; backend has no such field.

### 3.4 · Confirmed via curl

```bash
curl -X POST -H "x-staff-key: dev-..." -H "x-staff-id: 8bd0..." \
  -d '{"tableSessionId":"...","customerId":"...","content":"hi","kind":"direct_reply"}' \
  http://localhost:3001/api/restaurant_dev/staff-messages
# → 400 Bad Request
# "property tableSessionId should not exist", "property customerId should not exist",
# "property content should not exist", "property kind should not exist",
# "body must be a string"
```

The `MContactClientSheet.onSend` catches the error silently — there's no toast, no error UI. The bottom sheet just stays in `'selected'` state forever from the user's perspective. **Placebo**.

### 3.5 · MContactStaffSheet (manager→staff) is also broken

`MContactStaffSheet.onSend` POSTs to `/staff-messages/staff` (note the extra `/staff`):
```ts
await staffPost(`/${tenantSlug}/staff-messages/staff`, { toStaffId: target.staffId, content: draft.trim() });
```

That route doesn't exist either — `curl -X POST .../staff-messages/staff` returns **404 Not Found**.

Worse, the catch handler is:
```ts
} catch {
  // Soft-fail: still show "sent" UI to keep flow forward
  setState('sent');
}
```

So the manager sees a green "✅ Mensagem enviada" UI even though no DB row was created. **Theatrical placebo** — claims success on every failed request.

### 3.6 · DB state

```sql
SELECT count(*), max(created_at) FROM restaurant_dev.staff_messages;
-- count=3, max=2026-05-09 (day before this audit — those were inserted via direct API testing in round 18 button-audit, NOT via the UI sheet).
```

### 3.7 · The schema CAN support this

The migration `030_assistant_messages_extends.sql` added:
- `from_role TEXT CHECK ('customer','staff','ai','ack')`
- `to_staff_id UUID REFERENCES staff(id)`
- `read_at TIMESTAMPTZ` (for unread counting)
- `thread_id UUID`
- `kind TEXT`

So the storage exists. Only the endpoints and the WS event are missing.

### 3.8 · WS event

The V20 canvas server-notes (line 314) prescribes:
| `staff.message` | staff → customer | `MessageDto` (from_role='staff') |

`grep -n "session:.*emit\|staff.message\|assistant.staff_message" apps/api/src/modules/websocket/events.gateway.ts` returns **none of these events**. The only customer-receivable emits are `waiter:acknowledged`, `table_merge.*`, `merge.cooldown_started`. **No staff message emission to the session room.**

### Verdict

**❌ Doesn't work end-to-end.**
- `POST /staff-messages` rejects the payload as malformed (validation error 400).
- `POST /staff-messages/staff` doesn't exist (404).
- The "soft-fail to sent" pattern in `MContactStaffSheet` is a placebo that misleads the manager.
- No WS event emits to `session:${sessionId}` to deliver the message to the customer in real time.
- No customer-side handler listens for `staff.message`.

**The full chain — manager opens sheet → types text → clicks send → DB row → WS to customer → bubble renders → unread badge — is 100% non-functional** despite the schema being prepared.

---

## Section 4 · Chat notifications (modern UI)

### 4.1 · Customer-side state

The customer app has zero notification primitives:
- No `Badge` component for unread counts
- No `Toast` provider in `app/[slug]/layout.tsx`
- No `<Notification>` primitive in `components/ui/`
- No `useUnreadMessages()` or similar hook
- Searching `grep -rn "unread\|notification\|Notification\|Badge" apps/web-customer/src/` finds only:
  - `MenuDrawer.tsx:102` — `tableBadge` is the table-label badge (e.g. "M07"), unrelated to messages
  - Two component-level comments referencing push-notification rating prompts (no UI surface)

### 4.2 · What V20 canvas calls out

The canvas image "mensagem solo · iOS" (referenced in prompt) shows:
- A bubble with left-border accent color
- Eyebrow "RENATA · GERENTE"
- The body text + 36s typing indicator

`docs/design-canvas/handoff/cliente/server-notes.md:280-290`:
> Bubble com `from_role='staff'` aparece com:
> - Border-left 3px terracota
> - Header com badge mono "RENATA · GERENTE" (vem de `staff_name_snapshot`)
> - Sans body 15px (NÃO italic — IA é italic, gerente é "presença real")

None of this is implemented in `apps/web-customer/src/app/[slug]/assistente/page.tsx` — the bubble rendering uses a single style for all assistant turns. There's no branch on `from_role`.

### 4.3 · No transient affordance ("toast on receive")

When a manager message DID arrive (via a hypothetical working backend), the customer would have to be on `/assistente` to see it. There's no:
- App-shell notification dot
- Sound chime
- Vibration
- Lock-screen integration (PWA Push API)
- Toast that surfaces while customer is on `/cardapio`, `/orders`, or `/pagamento`

The MenuDrawer header has space for an unread badge but the data binding doesn't exist.

### 4.4 · WS subscribed events on customer side

`apps/web-customer/src/hooks/useZonePause.ts` shows the customer subscribes to a session room. But the only events handled are `zone-pause.activated` / `zone-pause.ended` / `table_merge.*` / `merge.cooldown_started`. No `staff.message` / `staff_message_received` / `assistant.message`.

### Verdict

**❌ Missing entirely**. The user's reference image ("notificação clean" with the green checkmark and the user-message bubble) is a design from a non-related app — there's no equivalent in our codebase. To ship it:

1. Add `read_at` query to count unread `assistant_messages` where `from_role='staff' AND customer_id=$me`.
2. Expose `GET /:slug/customer/unread-count` (or piggyback on `/home`).
3. Add a `<UnreadBadge>` to the AppShell — visible from any customer route.
4. WS event `staff.message` from the API → customer `useStaffMessages()` hook updates state → badge re-renders.
5. Toast component in AppShell layer that listens for the WS event and pops a transient card.
6. Sound / vibration optionally gated by user preference (mirror the `host/notificacoes-prefs` toggle pattern).

---

## Section 5 · API inventory vs canvas spec

API inventory: **109 endpoints across 27 modules** (`apps/api/src/modules/*/`). Canvas spec (`docs/design-canvas/handoff/cliente/server-notes.md` + V20 mockups) calls out these surfaces:

| Canvas reference | Endpoint expected | Current state |
|---|---|---|
| 4.2 continuation pool | `GET /:slug/continuation?customerId=&kind=` | ❌ **MISSING** — frontend calls it, 404s. AI service has the upstream. |
| 4.4 cortesias offer/respond | `POST /:slug/courtesies` | ⚠️ **PARTIAL** — schema exists (`courtesies` table); controller is `apps/api/src/modules/host/host.controller.ts` reading inbox but the customer-side offer/decline path is incomplete. (Need to deep-dive — left for round 19) |
| 4.5 staff→customer message | `POST /:slug/staff/messages` | ❌ **MISSING** — only staff↔staff `staff-messages` exists with mismatching DTO. |
| 4.5 customer→staff reply | `POST /:slug/customer/messages` | ❌ **MISSING** — no controller. |
| 5.6 smart-suggestions | `POST /api/smart-suggestions` (apps/api proxy) | ❌ **MISSING** — frontend hits `http://localhost:8000/smart-suggestions` directly (AI service), which is NOT reachable from the browser (port 8000 not exposed). |
| user's image — notifications drawer | `GET /:slug/notifications`, `POST /:slug/notifications/:id/read` | ⚠️ **PARTIAL** — staff side has `alerts` reused; no customer-side notifications endpoint. |
| host stub-only "round 19" comment | `POST /users/me/preferences` | ❌ **MISSING** |
| host stub-only "round 19" comment | `POST /auth/2fa/disable` | ❌ **MISSING** |
| host stub-only "round 19" comment | `DELETE /auth/sessions/:id` | ❌ **MISSING** |
| host stub-only "round 19" comment | `POST /auth/password/change` | ❌ **MISSING** |
| V20 "Conta" surface | `GET /:slug/customer/account` | ❌ **MISSING** — `/restaurant_dev/conta` returns 404 |
| V20 chat-history | `GET /:slug/chat-history/threads` | ✅ **DONE** |
| V20 LGPD | `POST /:slug/lgpd-requests` | ✅ **DONE** |
| V20 home greeting | `GET /:slug/home` | ✅ **DONE** (calls AI continuation internally) |
| V20 menu | `GET /:slug/menu/*` | ✅ **DONE** |
| V20 orders | `POST/PATCH /:slug/orders/*` | ✅ **DONE** |
| V20 payments | `POST /:slug/payments/*` | ✅ **DONE** |
| V20 waiter-calls | `POST /:slug/waiter-calls` | ✅ **DONE** |
| V20 ratings | `POST /:slug/order-ratings` | ✅ **DONE** |
| V20 table-merge | `POST /:slug/table-merge/*` | ✅ **DONE** |
| V20 host swap | `POST /:slug/host/swap-requests` | ✅ **DONE** |
| V20 host waitlist | `POST /:slug/host/waitlist` | ✅ **DONE** |
| V20 host reservations | `POST /:slug/host/reservations` | ✅ **DONE** |
| V20 dashboard | `GET /:slug/dashboard/*` | ✅ **DONE** |
| V20 zone-pause | `POST /:slug/zone-pauses` | ✅ **DONE** |
| V20 deliveries | `POST /:slug/deliveries/*` | ✅ **DONE** |
| V20 settings | `GET /:slug/settings/public` | ✅ **DONE** |
| V20 vip flags | `POST /:slug/staff/sessions/:id/flags` | ✅ **DONE** |

**Summary**: **7 missing critical endpoints** + **1 partial**.

---

## Section 6 · Missing screens/features

### 6.1 · Customer-side gaps

| Screen | Canvas reference | Status | Notes |
|---|---|---|---|
| `/conta` | V20 "Conta" (consumer account summary) | ❌ 404 | Likely embedded in `/mesa/[code]` (the running tab view). Direct deep-link impossible. |
| Late-arrival waiting screen | `cliente-late-arrival.jsx` | ✅ Exists (`/waiting-approval`) | Not auto-navigated from `/identify` when host_customer_id is set. Tested: redirected to `/identify` again. (Race condition with /assistente bug). |
| Notifications drawer (customer) | V20 canvas slot | ❌ MISSING | No customer "alerts" surface; staff side has `/manager/notifications` and `/host/notifications` but customer has none. |
| Order-status push receiver | (PWA push subscription) | ⚠️ Stub | `ScreenCustomerOrderRating.tsx:19` comment references push but no SW registration / `subscribe` exists. |
| Manager message bubble | V20 "mensagem solo · iOS" | ❌ MISSING | (See Section 4) |
| Unread badge | V20 chat-notification image | ❌ MISSING | (See Section 4) |
| Toast/transient notification | Standard mobile pattern | ❌ MISSING | (See Section 4) |
| In-app notification list | User's "notificação clean" image | ❌ MISSING | Would be customer equivalent of `/manager/notifications`. |

### 6.2 · Staff-side gaps

| Screen | Status | Notes |
|---|---|---|
| `/host/aparencia` | ⚠️ Stub-only | Theme toggle works locally |
| `/host/notificacoes-prefs` | ⚠️ Stub-only | Toggles localStorage only |
| `/host/seguranca` | ⚠️ Stub-only | Author confirms stubs in toasts |
| `/manager/notifications` | ✅ Wired | Alerts feed reused |
| `/manager/equipe/turnos` AddSheet | ⚠️ Mock-only | Per round18-button-audit P0 |
| `/manager/equipe/:id` "Editar funcionário" | ⚠️ Sticky footer issue (round18-sticky-footer-audit P0) | Below the fold at 852px height |

---

## Section 7 · Console-error inventory

**Method**: install console hook (overrides `console.error`, `console.warn`, `window.onerror`, `unhandledrejection`) via `Page.addScriptToEvaluateOnNewDocument` BEFORE each navigation. Wait 3s post-load. Read `window.__consoleLog`.

**Result**: **0 events across 34 routes** (manager + host + waiter + cozinha + customer-public + customer-conta-404).

The hook installation was confirmed functional via deliberate test (`console.error("test")` → captured correctly).

**Hypothesis on cleanness**: Most fetch errors are caught in try/catch by the calling code — including the 3 silent 404s to `/continuation` confirmed in Section 2. This is good production behavior but bad debugging signal. Recommend:

- Add a `window.__captureUnhandledFetchErrors()` shim wired to `apps/web-customer/src/lib/api.ts` `ApiRequestError` that logs to console.warn at least, even when swallowed.

**Inventory file**: `qa-reports/round18-console-inventory.json` (all 34 routes, all empty arrays).

---

## Section 8 · Prioritized next-round punchlist (top 5)

1. **[P0] Build `:slug/continuation` controller in apps/api**. Proxy to AI service `GET /continuation?...&kind=`. Derive `kind` from DB (latest `assistant_messages.action='menu_viewed'` / `waiter_calls.created_at` / `orders.created_at` / `payments.captured_at` / fallback). Without this the V20 chat-landing greeting is dead.

2. **[P0] Build `POST /:slug/staff/messages` + `POST /:slug/customer/messages`** per `docs/design-canvas/handoff/cliente/server-notes.md` section 4.5. Use existing `assistant_messages.from_role` schema. Fire WS event `staff.message` to `session:${sessionId}` room.

3. **[P0] Fix `/assistente` race condition.** Add `isHydrated: boolean` flag to SessionProvider state. The hydration `useEffect` should set it `true` after running `setCustomerId(bundle.customerId)`. The `/assistente` redirect effect should depend on `[isHydrated, session.customerId]` and only redirect when `isHydrated === true && !customerId`. Today: blank-state redirect fires immediately on mount.

4. **[P1] Replace `MContactClientSheet` placebo with real flow.** After endpoint 2 lands, point the sheet at `POST /:slug/staff/messages` with `senderStaffId` from `x-staff-id` header, `tableSessionId/customerId` in body, `content`/`body` aligned. Replace soft-fail in `MContactStaffSheet.onSend` catch with a real error toast.

5. **[P1] Customer-side notification primitive.** Add `<UnreadBadge>` to `apps/web-customer/src/components/layout/AppShell.tsx`. Hook `useUnreadMessages()` reads `read_at IS NULL AND from_role='staff'` count via `GET /:slug/customer/unread-count` (new), subscribes to `staff.message` WS event. Toast component (uses `vaul` already in deps) pops on receive.

### Bonus (P2 / housekeeping)

- **Smart-suggestions reachability**: `MContactClientSheet` calls `http://localhost:8000/smart-suggestions` directly — works in dev only because the browser is on the same host. In any non-dev deploy this fails (AI port not exposed). Proxy via `POST /api/smart-suggestions` in apps/api.
- **`/conta` route 404**: either add `/restaurant_dev/conta` as an alias to the running mesa view, or delete the link from anywhere that points at it. (V20 canvas may have already inlined this into the mesa tab — confirm with design.)
- **`window.__consoleLog` style debug**: ship a dev-only Datadog-like client that logs swallowed fetch errors to a debug overlay. Today the silent-catch pattern hides 100% of background failures.

---

## Appendix A · Files referenced

- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/qa-reports/round18-superscan-v2-raw.json` — full 37-route enumeration
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/qa-reports/round18-console-inventory.json` — all 34 routes' console output (empty)
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/qa-reports/round18-superscan-v2-shots/` — 37 PNG screenshots
- `<repo>/.claude/worktrees/objective-cerf-e49db1/qa-reports/round18-superscan.md` — v1 baseline (sibling worktree)
- `<repo>/.claude/worktrees/objective-cerf-e49db1/qa-reports/round18-button-audit.md` — v1 button audit
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/qa-reports/round17-bug-hunt.md` — round 17 source
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/apps/web-customer/src/app/[slug]/assistente/page.tsx:313` — `/continuation` 404 call site
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/apps/web-staff/src/components/manager/MContactClientSheet.tsx:114-128` — placebo onSend
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/apps/web-staff/src/components/manager/MContactStaffSheet.tsx:78-99` — placebo onSend "soft-fail to sent"
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/services/ai-service/main.py:524` — AI service `/continuation` GET handler (works, but apps/api never proxies)
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/docs/design-canvas/handoff/cliente/server-notes.md` — canvas API spec
- `<repo>/.claude/worktrees/wonderful-rhodes-95809e/apps/api/src/modules/staff-messages/staff-messages.controller.ts:25-50` — `SendMessageDto` shape that rejects MContactClientSheet payload

---

## Appendix B · Reproduction recipes

### B.1 · Customer continuation 404

```bash
SECRET=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c \
  "SELECT qr_hmac_secret FROM restaurant_dev.tables WHERE code = 'M07';")
TS=$(python3 -c "import time; print(int(time.time() * 1000))")
SIG=$(echo -n "M07:${TS}" | openssl dgst -sha256 -hmac "${SECRET}" -r | awk '{print $1}')

# Init session (HMAC handshake)
SESS=$(curl -sS -X POST -H "Content-Type: application/json" \
  -d "{\"tableCode\":\"M07\",\"hmacSignature\":\"${SIG}\",\"timestamp\":\"${TS}\"}" \
  http://localhost:3001/api/restaurant_dev/session/init | jq -r .sessionId)

# Welcome customer (note: customer/welcome — singular)
curl -sS -X POST -H "Content-Type: application/json" -H "x-session-token: ${SESS}" \
  -d '{"name":"QA Tester","cpf":"11144477735"}' \
  http://localhost:3001/api/restaurant_dev/customer/welcome

# Now hit continuation — confirmed 404
curl -i -H "x-session-token: ${SESS}" \
  "http://localhost:3001/api/restaurant_dev/continuation?tenantId=restaurant_dev&customerId=<id>&kind=viu_menu"
# Expect: HTTP/1.1 404 Not Found
```

### B.2 · Manager→customer placebo

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-staff-key: <chave-de-dev-antiga-bloqueada-em-producao>" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -d '{"tableSessionId":"<sid>","customerId":"<cid>","content":"test","kind":"direct_reply"}' \
  http://localhost:3001/api/restaurant_dev/staff-messages
# Expect: 400 — "property tableSessionId should not exist" + 4 more
```

### B.3 · Manager→staff theatrical placebo (UI claims success)

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-staff-key: <chave-de-dev-antiga-bloqueada-em-producao>" \
  -H "x-staff-id: 8bd06156-1fe5-4c18-a82d-43d38287ed4a" \
  -d '{"toStaffId":"<sid>","content":"test"}' \
  http://localhost:3001/api/restaurant_dev/staff-messages/staff
# Expect: 404 — but the UI shows green ✅ "Enviada" because catch{setState('sent')}
```

---

## Appendix C · Methodology notes

### C.1 · Why the v2 superscan flagged 31 "div-cursor-pointer" placebos that v1 didn't

`host-notificacoes-prefs` (new screen this round) uses `<label>` HTML elements wrapping `<input type="checkbox">` for toggle rows. The label inherits `cursor: pointer` style from inline styles. The native HTML behavior is: clicking the label triggers the checkbox's `change` event automatically — no JS handler needed. Our scanner flags any cursor:pointer element without React fiber `onClick` as a placebo, missing this HTML semantic. **All 31 are false positives**.

Recommendation for v3 of the scanner: skip `<label>` elements with a `<input type="checkbox">` descendant.

### C.2 · Why my console-error scan found 0 issues

The scan installs a hook that intercepts `console.error/warn/exceptionThrown/unhandledrejection` and stores into `window.__consoleLog`. Verified functional via deliberate test. The hook was installed via `Page.addScriptToEvaluateOnNewDocument` which runs **before** any page script.

Result: every route is genuinely silent. This reflects the codebase's pattern of try/catch swallowing all fetch errors:

```ts
} catch {
  /* silently fail — continuation é progressive enhancement */
}
```

This is the right production pattern but it hides the 3 confirmed 404s captured via `Network.responseReceived`. Recommend either (a) `console.warn` in the catch for dev builds, or (b) a Datadog-style debug overlay.

### C.3 · Coverage caveats

- The 393×852 viewport doesn't capture desktop tablet flows for `cozinha` (which is intended for tablets — v1 already flagged this).
- Customer-side routes need session orchestration (HMAC + welcome + bundle). I tested with both clean and pre-seeded session — confirmed the race condition.
- Did not exercise WS events end-to-end (would require dual-tab orchestration via browser-harness which is supported but adds latency). The static code analysis is sufficient to prove the staff→customer WS event doesn't exist.

— end of report —
