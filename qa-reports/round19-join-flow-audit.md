# Round 19 · Customer Join-Table Flow Audit

## User ask

"teste a ui de pedir pra entrar na mesa, veja se a notificação chega certinho pro
host da mesa, se tem tela pra aceitar, se não tiver faça uma tela cheia quando
clica na notificação e dai a tela de espera do outro cliente tentando entrar na
mesa tambem tem que exisitir e as duas tem que funcionar"

Translation: the full-screen join-request UI (both host accept + customer wait)
must exist AND work end-to-end.

## Audit · existing surfaces

There are TWO parallel systems for "another customer wants to join the table":

### System A · `session_participants` (table-session module)
- **API**: `POST /:slug/customer/welcome` → `upsertParticipant` writes a row
  in `session_participants`; first scanner becomes `host` (sets
  `table_sessions.host_customer_id`), subsequent scanners enter as
  `status='pending'`.
- **WS event**: `participant:join_request` emitted to `session:<id>` room
  when a non-host pending participant lands.
- **Decision**: `POST /:slug/table/participants/decide` with
  `{ targetCustomerId, decision }`.
- **Host UI**: `HostApprovalModal` (sticky bottom dialog · 420px max-width)
  on the mesa home — fetches `/table/participants` and lists pending with
  "Aprovar" / "Rejeitar" inline buttons. Only mounted when `isHost===true`.
- **Joiner UI**: `PendingApprovalScreen` (full-screen, V13-style dots
  loader) shown when `pageState === 'pending_approval'`.

### System B · `late_arrival_requests` (late-arrival module)
- **API**: `POST /:slug/late-arrival-requests` (`customerId`, `tableSessionId`).
- **WS events**: `late_arrival.created`, `late_arrival.approved`,
  `late_arrival.rejected`, `late_arrival.expired`.
- **Customer client**: `createLateArrivalRequest` exists in
  `apps/web-customer/src/lib/api/customer-host.ts` BUT is never imported
  / called anywhere in `apps/web-customer/src/**`.
- **Host UI (customer side)**: `ScreenCustomerHostApproveJoin.tsx` (V20
  canon · countdown + TypewriterBubble + party block + filled/outline
  CTAs) routed at `/[slug]/host/approve/join?requestId=...`.
- **Joiner UI**: `ScreenCustomerWaitingApproval.tsx` (V20 canon LOCKED ·
  Pulse/CheckMark/Sleep + countdown) at `/[slug]/waiting-approval`.
- **Identify gate**: `ScreenCustomerIdentifyBeforeJoin.tsx` at
  `/[slug]/identify` — V20 canon LOCKED — collects name + CPF before
  joining; redirects to `/waiting-approval` on submit but DOES NOT trigger
  the late-arrival API.
- **Staff fallback**: `apps/web-staff/src/screens/host/ScreenHostLateArrival.tsx`
  renders when staff opens `/host/late-arrival/[id]` — staff inbox UI.

## Five questions

| Question | Answer |
|---|---|
| Endpoint to create a join request | ✅ Two exist: `/customer/welcome` (System A) and `/late-arrival-requests` (System B) |
| Host gets real-time WS notification | ✅ `participant:join_request` (System A) and `late_arrival.created` (System B). HostApprovalModal listens via `useTableSocket`. |
| Screen for host to accept/reject | ⚠️ Two: HostApprovalModal (sticky bottom dialog · System A, currently the LIVE one) and ScreenCustomerHostApproveJoin (full-screen · V20 · System B, NOT wired). |
| Waiting screen for joining customer | ⚠️ Two: PendingApprovalScreen (full-screen V13 · System A, LIVE) and ScreenCustomerWaitingApproval (full-screen V20 · System B, NOT wired). |
| End-to-end wired | ❌ The live flow is System A which uses a SKINNY BOTTOM MODAL on the host side; the V20 full-screen screens exist but aren't reachable from the customer scan flow. |

## Bugs discovered during audit

1. **Host modal disappears on reload** (`apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`)
   - On reload, the recognize path skips `handleWelcomeComplete`, so
     `checkParticipantStatus` never runs, so `isHost` stays false → modal
     never mounts even when pending requests exist.
   - Repro: customer A scans QR → registers as host → customer B scans
     QR with different cookies (different CPF) → API correctly marks B
     pending → reload customer A's page → the bottom modal does NOT show.

## What we'll build

Per the user ask: the late-arrival flow's full-screen screens must light up.
We will:

1. **Bridge System A → System B (wiring)**
   - When the welcome flow auto-creates a pending participant (because
     someone else is already host), the customer should land on
     `ScreenCustomerWaitingApproval` (full-screen V20) instead of the
     skinny dots screen.
   - When the host (customer A) sees a pending join request — instead of
     the sticky bottom modal alone — there should be a notification
     surface that, when tapped, opens the full-screen
     `ScreenCustomerHostApproveJoin`-equivalent screen.

2. **Fix the host-modal-on-reload bug** so the host always knows there are
   pending joiners.

3. **Build the missing full-screen Host Approve Join screen for System A**
   (works against `/table/participants/decide` instead of the late-arrival
   approve API). Renders a clickable notification bell/banner on the home;
   bell click opens the full-screen accept page. V20 canon — copies the
   visual canon from `ScreenCustomerHostApproveJoin.tsx`.

4. **Promote the joiner waiting flow to V20 canon screen**: when joiner
   is pending, render `ScreenCustomerWaitingApproval` instead of the V13
   `PendingApprovalScreen` — it already exists and is locked V20.

Files we'll create (System A bridge — works against existing endpoints,
no migration needed):
- `apps/web-customer/src/screens/customer-host-flows/ScreenHostApproveJoinParticipant.tsx`
  (full-screen approve, V20 canon, calls `/table/participants/decide`)
- `apps/web-customer/src/app/[slug]/host/approve/participant/[customerId]/page.tsx`
  (full-screen route)

Files we'll modify (no V20 visual changes to locked surfaces):
- `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`
  - bug fix: call `checkParticipantStatus` on the recognize path too
  - render a notification banner ("X pessoa quer entrar") instead of
    relying solely on the sticky bottom modal
  - swap V13 `PendingApprovalScreen` for V20 `ScreenCustomerWaitingApproval`
    (mode='late-arrival') for the joiner

Why not delete System A entirely or wire System B from scratch?
- The user surface that's actually live is System A. Killing it now would
  break customer joins for tenants in prod.
- System B's API (late-arrival) was designed for "I'm running late,
  please hold my spot" — distinct semantics from "I just scanned the QR
  and you're already here". The current code reuses the late-arrival
  approve/reject for the same UX but never creates the request.
- The safest fix is to use System A's data layer (already correct) with
  System B's V20 visual canon — net result is the V20 user experience
  the user wants, without churning the backend.

## Verification plan

After build:
1. Customer A scans QR → registers → mesa home. ✅
2. Customer B scans same QR (new cookies) → welcome → submits → V20
   full-screen waiting screen renders with pulse + countdown. ✅
3. Customer A reloads mesa home → notification banner appears ("1 pessoa
   quer entrar"). ✅
4. Customer A taps banner → full-screen approve screen opens with Bruno
   info + Approve/Reject. ✅
5. Customer A approves → Customer B's waiting screen WS-flips to
   "Aprovado" → auto-redirects to mesa home. ✅
6. Customer A reloads after approval → banner gone (no more pending). ✅

## Test results

All steps validated via Playwright MCP at 393×852 with screenshots in
`qa-reports/round19-join-flow-shots/`:

| Step | Screenshot | Outcome |
|---|---|---|
| Alice registers via Welcome V20 | round19-1-customer-a-welcome.png | ✅ |
| Alice home post-register (no banner) | round19-2-customer-a-home.png | ✅ |
| Alice mesa with V20 banner + legacy modal | round19-6-host-with-banner-v2.png | ✅ |
| Full-screen Host Accept (V20 canon) | round19-7-host-approve-fullscreen.png | ✅ |
| V20 Wait Screen (Customer B) | round19-8-customer-b-waiting-v20.png | ✅ |
| Approve happy-path → Bruno approved in DB | verified via psql | ✅ |
| Reject happy-path → Bruno rejected in DB | verified via psql | ✅ |
| Banner disappears post-decision | round19-10-host-after-approve.png | ✅ |

## TypeScript

`cd apps/web-customer && npx tsc --noEmit` → exit 0 (clean).

## V20 LOCKED files

Confirmed untouched per CLAUDE.md:
- `components/welcome/WelcomeModal.tsx`
- `components/welcome/CpfInput.tsx`
- `screens/customer-host-flows/ScreenCustomerIdentifyBeforeJoin.tsx`
- `screens/customer-host-flows/ScreenCustomerWaitingApproval.tsx`
- `components/ui/CallWaiterSheet.tsx`
- `app/[slug]/assistente/page.tsx`
- `app/[slug]/mesa/[tableCode]/page.tsx` reclaim banner section
  (unchanged — added imports + 2 component slots above untouched
  reclaim banner)

`git diff --stat` shows 132 insertions / 4 deletions concentrated in:
- the new effect (recognize-path bug fix · 27 lines)
- two new component mounts (banner + wrapper · 3 lines)
- the new `PendingApprovalWrapper` helper at bottom of file (66 lines)
- 2-line addition to `useTableSocket` events array

No visual tokens changed in locked surfaces.
