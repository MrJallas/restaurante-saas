# Staff login superusers QA

Generated: 2026-05-26T03:28:04.422Z

## Roles
- manager 90000000001 -> http://localhost:3002/manager; protected requests: GET /zone-pauses?active=true role=manager key=present, GET /complaints role=manager key=present, GET /late-arrival-requests role=manager key=present, GET /table-merge-requests role=manager key=present, GET /lgpd-requests role=manager key=present, GET /staff role=manager key=present; screenshot=01-manager.png
- host 90000000002 -> http://localhost:3002/host; protected requests: GET /host/tables role=host key=present, GET /late-arrival-requests?status=pending role=host key=present, GET /scan-verification-requests?status=pending role=host key=present; screenshot=02-host.png
- waiter 90000000003 -> http://localhost:3002/waiter; protected requests: GET /staff/my-tables role=waiter key=present, GET /waiter-calls/pending role=waiter key=present, GET /zone-pauses?waiterId=e82a5258-1006-4e11-bbed-c4f79e1da225&active=true role=waiter key=present; screenshot=03-waiter.png
- cook 90000000004 -> http://localhost:3002/cozinha; protected requests: GET /kitchen/queue role=cook key=present; screenshot=04-cozinha.png

## Forgot/reset
- 90000000001: code prefilled in dev=true; resetTo=1234; final=http://localhost:3002/login

## Wrong PIN
- 90000000001: CPF ou PIN inválidos.; screenshot=09-wrong-pin.png
