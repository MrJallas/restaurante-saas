# Staff bubble render — V20 canon check

Brief: manager replies should render via `<StaffBubble>` (border-left
3px `ink`, eyebrow `RENATA · GERENTE`) per V20 canon §F11_Manager.

Status: **FAIL** in chat-history thread view · **PASS** in active chat.

## Component matrix

| Component | Stripe | Eyebrow | Source |
|---|---|---|---|
| `StaffBubble` | `border-l-[3px] border-l-ink` (black) | `<NAME> · <ROLE>`, e.g. `RENATA · GERENTE` | V20 canon §F11 — `cliente-journey-v20.jsx` |
| `ManagerBubble` | `border-l-[3px] border-l-warning` (mostarda) | `Renata avisou` (sentence case) | complaint-flow-v12.md §ChipActionInset |
| `Bubble role='ai'` | none | none / "ASSISTENTE" eyebrow elsewhere | base IA bubble |

## Where each is used

| Surface | Uses | Correct? |
|---|---|---|
| `apps/web-customer/src/app/[slug]/assistente/page.tsx:1496` | `<StaffBubble name="Renata" role="Gerente">` for inbound manager messages in live chat | YES (V20) |
| `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerStaffThread.tsx:296` | `<StaffBubble>` for staff message inbox thread | YES (V20) |
| `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerChatThread.tsx:291` | `<ManagerBubble>` for `role === 'manager'` in HISTORICAL chat view | **NO** — uses complaint-flow component, not V20 canon |
| `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerComplaintWaiting.tsx:230` | `<ManagerBubble>` for complaint reply | YES (this surface IS complaint-flow) |

## Impact

Result: a manager message that the customer sees in `/assistente` with an
ink stripe gets a mostarda stripe when re-viewed in the history. Visual
language drifts depending on entry point.

## Fix

In `apps/web-customer/src/screens/feedback-and-history/ScreenCustomerChatThread.tsx`,
swap line 13:

```tsx
import { ManagerBubble } from '../../components/ui/ManagerBubble';
```

for

```tsx
import { StaffBubble } from '../../components/ui/StaffBubble';
```

and line 290-298 from `<ManagerBubble … >` to:

```tsx
<StaffBubble name="Renata" role="Gerente" when={formatBubbleTime(msg.createdAt)}>
  {msg.content}
</StaffBubble>
```

`StaffBubble` supports the same `name`/`role`/`when` props.

## Side note — `chat_messages.role` enumeration

Backend stores `role` as a free string for chat messages
(`apps/api/src/modules/chat-history/chat-history.service.ts:49`). Today
producers use `user`, `assistant`, `system`. There's no clear path that
writes `role: 'manager'` to Mongo:

```bash
grep -rn "role.*manager\|role: 'manager'" apps/api/src/modules/chat-history/
# (no producer hits)
```

So the `<ManagerBubble>` branch in `ScreenCustomerChatThread.tsx` may be
dead code today — but the FE component branching is still wrong for the
day someone wires the producer (Onda 3 in the docstring). Worth fixing
proactively.
