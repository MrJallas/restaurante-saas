/**
 * Smoke test for the CORS preflight from the web-staff origin.
 *
 * The bug we are guarding against (P0 #1 in the consolidated E2E report):
 * `apps/api/src/main.ts` reads `CORS_ORIGINS` from env, but real `.env`
 * files were missing `http://localhost:3002` (the web-staff dev origin).
 * Result: every staff fetch failed in the browser with a CORS error before
 * the request even reached the controller. The fix (rooted in
 * `.env.example` + `apps/api/.env.example`) lists both 3003 and 3002.
 *
 * The test runs with the built-in `node:test` runner so we don't have to
 * pull jest/vitest into `web-staff` just for one smoke. It is *integration*
 * by nature: it requires the API to be running locally on :3001. When the
 * API is not reachable we mark the case skipped — running this in CI
 * without a live API would otherwise produce noisy false negatives. In
 * that case the `curl` command in the PR body is the manual fallback.
 *
 * Run locally:
 *   docker compose up -d api
 *   node --test --import tsx apps/web-staff/__tests__/smoke-cors.test.ts
 *
 * Equivalent curl (also documented in the PR body):
 *   curl -i -X OPTIONS http://localhost:3001/api/restaurant_dev/zone-pauses \
 *     -H 'Origin: http://localhost:3002' \
 *     -H 'Access-Control-Request-Method: POST' \
 *     -H 'Access-Control-Request-Headers: x-staff-key,x-staff-role,x-staff-id'
 *   # expect: HTTP/1.1 204 No Content
 *   #         Access-Control-Allow-Origin: http://localhost:3002
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_URL =
  process.env.SMOKE_API_URL ?? 'http://localhost:3001/api/restaurant_dev/zone-pauses';
const STAFF_ORIGIN = 'http://localhost:3002';

async function apiReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1_000);
    const res = await fetch(API_URL, {
      method: 'HEAD',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    // Any HTTP response (including 4xx/5xx) means the API is up.
    return res.status >= 0;
  } catch {
    // Network error / abort / connection refused — treat as not reachable.
    return false;
  }
}

test('OPTIONS preflight from web-staff origin returns CORS headers', async (t) => {
  if (!(await apiReachable())) {
    t.skip('API not running on :3001 — skipping live preflight smoke');
    return;
  }

  const res = await fetch(API_URL, {
    method: 'OPTIONS',
    headers: {
      Origin: STAFF_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-staff-key,x-staff-role,x-staff-id',
    },
  });

  // Nest + Express defaults respond 204 No Content on a successful preflight.
  assert.equal(res.status, 204, `expected 204, got ${res.status}`);

  // The critical assertion: the API must echo the staff origin. If this
  // fails, the running API process has a stale `CORS_ORIGINS` that omits
  // :3002 — regenerate `apps/api/.env` from `.env.example` and restart.
  const allowOrigin = res.headers.get('access-control-allow-origin');
  assert.equal(
    allowOrigin,
    STAFF_ORIGIN,
    `Access-Control-Allow-Origin must echo ${STAFF_ORIGIN} — got ${allowOrigin}. ` +
      `Likely cause: the running api process has stale CORS_ORIGINS env (missing :3002).`,
  );
});
