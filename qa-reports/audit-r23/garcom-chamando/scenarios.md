# /garcom/chamando — Scenarios

**Branch**: `fix/customer-tools-and-continuation`
**Device**: iPhone 17e (UDID `97E08813-F71A-4AA9-9EBA-D6BB22601867`) via idb companion `localhost:10884`
**Page source**: `apps/web-customer/src/app/[slug]/garcom/chamando/page.tsx`
**Polling endpoint**: `GET /api/{slug}/waiter-calls/{callId}` every 5s
**Important**: This page is **polling-only**. It does NOT subscribe to WS — state propagation is purely via the 5s interval `apiGet` inside `useEffect`.

---

## (a) Pending state — initial render

**Result**: PASSED — UI renders correctly with all V20 canon elements.

- URL: `/restaurant_dev/garcom/chamando?callId=2e66dc9f-...&reason=serve_drink`
- Status visible in screenshot `01-initial-pending.png`:
  - Ring icon (◔) with double ripple (`animate-ripple opacity-0.15 / 0.10`)
  - Eyebrow mono uppercase `AGUARDANDO CONFIRMAÇÃO` (text-mute)
  - Title 26/600: `Chamando garçom.` (one trailing dot from animated dots — `setDots((d)=>(d+1)%4)` at 500ms)
  - Subtext 13/mute: `O chamado foi enviado. Aguarde a confirmação do garçom.`
  - Motivo card with `✦` icon: `Motivo: Servir bebida ou vinho. Enquanto espera, você pode continuar navegando pelo cardápio.`
  - Bottom CTAs: `Cancelar chamado` (outline) + `Ver cardápio` (filled, V20 canon)

**DIFF vs task description**:
- The task spec said "Timer counting up + reason mostrada". **There is NO timer counting up.** Implementation uses `setDots` animation (3 dots cycling every 500ms — `.` → `..` → `...` → ` `). No elapsed-seconds counter exists.

---

## (b) WS `waiter_call.assigned` — assigned state

**Result**: PASSED (API + DB), VISUAL UNVERIFIED on iOS Safari (see "Note on iOS Safari WebView" below).

Backend flow confirmed:
- Endpoint: `POST /waiter-calls/{callId}/acknowledge` (requires `x-staff-key`)
- DB write: `status='acknowledged'`, `assigned_waiter_name='Ana Garcom'`, `eta_minutes=3`, `acknowledged_at=now()`
- GET response after acknowledge:
  ```json
  {"callId":"...","status":"acknowledged","reason":"serve_drink","waiterName":"Ana Garcom","etaMinutes":3,"acknowledgedAt":"..."}
  ```
- Page branch (`isAcknowledged = call?.status === 'acknowledged'`) renders:
  - Eyebrow `Chamado confirmado` (text-success — green)
  - Title `Um garçom está a caminho!`
  - Subtext `Ele já está se dirigindo à sua mesa.`
  - Waiter card with initial `A` in circle + `Seu garçom` / `Ana Garcom` / `Tempo estimado: 3 min`

**DIFF vs task description**:
- Task spec used `status='assigned'` — actual code uses `status='acknowledged'`.
- Task spec used `waiter_id` field — actual code uses `assigned_waiter_name` (varchar). The `acknowledged_by` UUID column is separate and rarely populated in code paths I reviewed.

---

## (c) WS `waiter_call.resolved` — resolved state

**Result**: PASSED (API + redirect logic confirmed).

Backend flow:
- Endpoint: `POST /waiter-calls/{callId}/resolve` (`x-staff-key`)
- DB write: `status='resolved'`, `resolved_at=now()` (only if previous status IN ('pending','acknowledged'))
- GET response: `{"status":"resolved","resolvedAt":"..."}`

Page redirect (page.tsx:55-57):
```ts
if (data.status === 'resolved') {
  router.replace(`/${slug}/cardapio`);
}
```

**DIFF vs task description**:
- Task spec said "redirect ... or Home elements". Actual redirect is to `/{slug}/cardapio` (menu page), NOT home.

---

## (d) Cancelar button — customer cancel

**Result**: PASSED (API + DB).

Backend flow:
- Endpoint: `PATCH /waiter-calls/{callId}/cancel` (`x-session-token`)
- DB write: `status='cancelled'`, `cancelled_at=now()` WHERE `status='pending'` (idempotent guard)
- Response: `{"callId":"...","status":"cancelled"}`

Page click handler (page.tsx:70-82):
```ts
await apiPatch(`/${slug}/waiter-calls/${callId}/cancel`, {});
replace(`/${slug}/assistente`);
```
- Uses `replace` (not `push`) to avoid swipe-back ghost screen — comment on lines 78-80 references the bug-hunt fix.
- Button label: `Cancelar chamado` (confirmed via screenshot).

DB confirmed cancel:
```
fb786abb-32e2-42cd-85d2-2c62a95af338 | cancelled | serve_drink | cancelled_at: 2026-05-15 20:32:18
```

**NOTE**: Cancel only valid while `status='pending'`. After acknowledge, the UPDATE returns 0 rows and the endpoint surfaces a NotFound/error to the client.

---

## (e) Hard-reload preserves state via polling

**Result**: PASSED — verified by source analysis + API replay.

The page is fully driven by URL search params (`callId`, `reason`) + polling. There is no client-side state mutation outside the `useEffect`. Any hard-reload re-mounts the same `useEffect`, immediately calls `apiGet(/{slug}/waiter-calls/{callId})`, and re-derives `isAcknowledged` / waiter name / ETA from the response.

Verified by re-querying the GET endpoint with the persisted `sessionStorage.session_token` — the API returns the same call payload regardless of when the request is made, as long as the call is still in an active status (`pending`, `acknowledged`).

**EDGE CASE**: If the call has been `resolved` before the reload, the `useEffect` on first load detects `status==='resolved'` and immediately `router.replace`s to `/cardapio` — same as scenario (c). If `cancelled`, the page renders the pending state shell (since `isAcknowledged===false`), which is a minor UX bug — the cancel branch isn't gated. Worth a follow-up.

---

## Note on iOS Safari WebView (visual verification limitation)

idb's `ui tap` + `ui text` commands do not reliably focus iOS Safari WebView inputs (no software keyboard appears, inputs remain blank). This is a known constraint for headless iOS Safari automation: keyboard events bypass the WebView's input chain.

To complete a full end-to-end visual verification of scenarios (b)/(c)/(d)/(e), one would need:
1. A test harness that bypasses the WelcomeModal (e.g., bootstrap a session via API then inject `sessionStorage.session_token` via a same-origin debug page), OR
2. Use Playwright/CDP against `localhost:3003` directly (no iOS sandbox), OR
3. Manual interaction on a real iPhone in Safari.

For this audit, **(b)/(c)/(d) were verified end-to-end at the API+DB layer** (status transitions, GET response shape, endpoints, guards). The **page-rendering logic** for each branch was verified by reading `page.tsx` directly. The **initial pending state (scenario a) was visually confirmed** in `screenshots/01-initial-pending.png`.

The remaining `02-acknowledged.png` and `03-...` screenshots taken during the run show the same pending-state UI because the session_token was not persisted into Safari's sessionStorage — they're not useful as evidence of the acknowledged branch.
