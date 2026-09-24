# Join Table AI Typewriter QA

Date: 2026-05-28
Branch: `codex/prompt-13-join-table-ai`

## Runtime

- Worktree stack recreated from this branch for `api`, `ai-service`, and `web-customer`.
- AI service configured for local LM Studio at `http://host.docker.internal:1234/v1`.
- Host LM Studio model endpoint verified at `http://<IP-da-LAN>:1234/v1/models`.
- Browser smoke check: `http://localhost:3003/restaurant_dev/assistente` loaded with title `Restaurant SaaS`.

## Automated Evidence

- `python -m pytest services/ai-service/tests -q`: `237 passed, 2 warnings`.
- `npm run build -w @restaurant/api`: passed.
- `npm run build -w @restaurant/web-customer`: passed.
- `npm run e2e -w @restaurant/web-customer -- join-table-ai-typewriter.spec.ts`: `1 passed`.
- `idb` smoke evidence on booted iPhone 16 Pro iOS 18.4: app loaded at `http://localhost:3003/restaurant_dev/assistente`.

## Flow Covered

- Host enters QRTEST91 as the table host.
- Joiner enters the same table and lands in waiting approval.
- Host assistant receives a `TypewriterBubble` with join chips.
- Host types `pode`; assistant emits `accept_join_request`; browser calls `/table/participants/decide`; DB participant status becomes `approved`.
- Second joiner enters the same table and lands in waiting approval.
- Host types `agora não`; assistant emits `reject_join_request`; browser calls `/table/participants/decide`; DB participant status becomes `rejected`.
- `assistant_messages.tool_calls` includes both `accept_join_request` and `reject_join_request`.

## Artifacts

- `01-host-typewriter-approval.png`
- `02-host-approval-decision.png`
- `03-joiner-approved.png`
- `04-host-typewriter-rejection.png`
- `05-host-rejection-decision.png`
- `06-joiner-rejected.png`
- `07-idb-ios-assistente.png`
- `idb-list-targets.json`
- `idb-list-targets.stderr`
