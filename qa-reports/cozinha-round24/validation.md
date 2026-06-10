# Cozinha Round 24 validation

Date: 2026-05-26

## Scope

- Bug 24: KDS calls waiter instead of marking delivered.
- Bug 25: KDS theme modes and `/cozinha/eu` as kitchen operations screen.
- Bug 32: manager reorder request requires kitchen response.

## Automated checks

- `git diff --check` passed.
- `npm exec --workspace @restaurant/api tsc -- --noEmit` passed.
- `npm exec --workspace @restaurant/web-staff tsc -- --noEmit` passed.
- `npm run build --workspace @restaurant/shared-types` passed.
- `npm run build --workspace @restaurant/api` passed.
- `npm run build --workspace @restaurant/web-staff` passed.
- `node --test --experimental-strip-types apps/web-staff/__tests__/smoke-cors.test.ts` passed.
- `node --test --import tsx apps/web-staff/__tests__/smoke-cors.test.ts` passed after installing `tsx`.
- `npm exec --workspace @restaurant/web-customer tsc -- --noEmit` passed.
- `npm run e2e --workspace @restaurant/web-customer` passed: 44 passed, 1 skipped in 4.2m.
- `E2E_STOP_MONGO=1 npm exec --workspace @restaurant/web-customer playwright -- test e2e/specs/physical-qr-heavy.spec.ts:560` passed: 1 passed in 19.7s.
- `docker exec restaurant-mongodb mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok'` returned `1` after the destructive Mongo-stop test.

Dependency note: `tsx@4.22.3` is installed as a root dev dependency and globally in the active Node (`/Users/calebmedeiros/.nvm/versions/node/v24.15.0/bin/tsx`).

Playwright setup note: the customer E2E suite runs as iPhone 14/WebKit and now grants geolocation in `apps/web-customer/playwright.config.ts`, matching the QR flow's current location requirement.

Local DB note: `restaurant_dev` in the Docker Postgres was missing tenant migrations after `049_scan_verification_physical_qr.sql`. Ran:

- `docker exec -w /repo -e DATABASE_URL=postgresql://postgres:postgres@postgres:5434/restaurant_saas restaurant-api npm run migrate:tenants --workspace @restaurant/database -- restaurant_dev`

Applied locally:

- `050_customer_geofence_and_fee.sql`
- `052_staff_shift_end_requests.sql`
- `053_kitchen_handoff_and_reorder_requests.sql`

## Browser verification

Local dev server: `http://localhost:3013`

HTTP route smoke:

- `GET /cozinha` returned `200 text/html; charset=utf-8`.
- `GET /cozinha/eu` returned `200 text/html; charset=utf-8`.

Observed `/cozinha`:

```text
Cozinha — KDS
Som ON
NOVOS
0
Vazio
PREPARANDO
0
Vazio
PRONTOS
0
Vazio
EM TRÂNSITO
0
Vazio
```

Observed `/cozinha/eu`:

```text
Cozinha — Gestão
TURNO DA COZINHA
Equipe e escala
Pessoa da cozinha
Turno
Escalar
EQUIPE
0 pessoas ativas
ADICIONAR ASSISTENTE/COZINHEIRO
Adicionar
OPERAÇÃO EM TEMPO REAL
Turno atual
Ocultar turno
ENTRARAM
0
EM PREPARO
0
PRONTOS
0
EM TRÂNSITO
0
TEMPO MÉDIO
0 min
Sair
```

## Not run

- iOS simulator/idb origin flow was not run in this pass.
- Native-device/manual browser validation was not run; Playwright covered WebKit iPhone 14 emulation against the local Docker stack.
