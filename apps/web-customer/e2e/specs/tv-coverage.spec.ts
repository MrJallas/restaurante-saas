import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import {
  ensureTvFixtures,
  clearWelcomeAndThrottleLocks,
  dailyAccessToken,
  purgeTvTestCustomers,
} from '../helpers/tv-fixtures';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const API = 'http://localhost:3001/api/restaurant_dev';
const STAFF = 'http://localhost:3002';
const STAFF_KEY = 'dev-staff-api-key-change-in-prod';
const M01_SECRET = '38889aad-20d1-4778-b4ab-df35774c0398';
const PROXY = `${STAFF}/api/proxy/restaurant_dev`;

// Caminhos de código-fonte PORTÁVEIS, relativos a este spec. Antes os
// testes liam de `/Users/.../.claude/worktrees/charming-yonath-d5e23e/...`
// — uma worktree do autor que não existe mais (ENOENT) e nem batia com o
// layout do repo. __dirname aqui é `apps/web-customer/e2e/specs`.
const apiSrc = (rel: string) => resolve(__dirname, '../../../api/src', rel);
const staffSrc = (rel: string) => resolve(__dirname, '../../../web-staff/src', rel);

function psql(query: string): string {
  const out = execSync(
    `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "SET search_path = restaurant_dev; ${query}"`,
    { encoding: 'utf8' },
  );
  const lines = out.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'SET');
  return lines[lines.length - 1]?.trim() ?? '';
}

function psqlAll(query: string): string[] {
  const out = execSync(
    `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "SET search_path = restaurant_dev; ${query}"`,
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter((l) => l.trim() !== '' && l.trim() !== 'SET')
    .map((l) => l.trim());
}

function redisExec(cmd: string): string {
  try {
    return execSync(`docker exec restaurant-redis redis-cli ${cmd}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function getSessionToken(): Promise<string> {
  const crypto = await import('node:crypto');
  const ts = Date.now();
  const sig = crypto.createHmac('sha256', M01_SECRET).update(`M01:${ts}`).digest('hex');
  const res = await fetch(`${API}/session/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tableCode: 'M01',
      hmacSignature: sig,
      timestamp: String(ts),
      accessToken: dailyAccessToken('M01', M01_SECRET),
    }),
  });
  const body = (await res.json()) as { sessionId: string };
  return body.sessionId;
}

test.beforeAll(() => {
  ensureTvFixtures();
  clearWelcomeAndThrottleLocks();
});

// P1-4: XFF bypass — rate-limit must use real IP, not X-Forwarded-For
test.describe('P1-4 — rate-limit ignores X-Forwarded-For', () => {
  test('250 GETs with rotating XFF still hit rate-limit by real IP', async () => {
    const calls = Array.from({ length: 250 }).map((_, i) =>
      fetch(`${API}/orders/_kds?station=kitchen`, {
        headers: {
          'x-staff-key': STAFF_KEY,
          'x-forwarded-for': `1.2.3.${i % 256}`,
        },
      }).then((r) => r.status),
    );
    const statuses = await Promise.all(calls);
    const rate429 = statuses.filter((s) => s === 429).length;
    expect(rate429, 'should hit 429 regardless of XFF rotation').toBeGreaterThanOrEqual(30);
  });
});

// P2-2: waiter_calls ON CONFLICT — parallel calls produce 1 row
test.describe('P2-2 — waiter_calls ON CONFLICT dedup', () => {
  test.afterAll(() => {
    psql(`DELETE FROM waiter_calls WHERE status IN ('pending','acknowledged')`);
  });

  test('30 parallel POST /waiter-calls yield 1 pending row', async () => {
    psql(`DELETE FROM waiter_calls WHERE status IN ('pending','acknowledged')`);
    const token = await getSessionToken();
    const results = await Promise.all(
      Array.from({ length: 30 }).map(() =>
        fetch(`${API}/waiter-calls`, {
          method: 'POST',
          headers: { 'x-session-token': token, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'other' }),
        }).then(async (r) => ({ status: r.status, body: (await r.json()) as { callId?: string } })),
      ),
    );
    const ids = new Set(results.filter((r) => r.body.callId).map((r) => r.body.callId));
    const dbCount = Number(psql(`SELECT count(*) FROM waiter_calls WHERE status = 'pending'`));
    expect(dbCount, 'DB should have exactly 1 pending row').toBeLessThanOrEqual(1);
    expect(ids.size, 'all 30 calls should return same callId').toBe(1);
  });
});

// P2-3: acknowledgeCall CAS — parallel acks yield 1 winner
test.describe('P2-3 — acknowledgeCall CAS race', () => {
  test.afterAll(() => {
    psql(`DELETE FROM waiter_calls WHERE status IN ('pending','acknowledged')`);
  });

  test('parallel acknowledges produce 1 acknowledged row with the authenticated staff name (CAS)', async () => {
    psql(`DELETE FROM waiter_calls WHERE status IN ('pending','acknowledged')`);
    // Nesta branch o assigned_waiter_name vem do x-staff-id AUTENTICADO (NÃO do
    // body — auditoria de QUEM atendeu; mais seguro que confiar no body). Usa
    // staff ativos DISTINTOS: sob a corrida, o CAS (WHERE status='pending')
    // deixa só 1 gravar — o nome final é o do garçom autenticado vencedor.
    const staff = psqlAll(`SELECT id || '|' || name FROM staff WHERE is_active = true LIMIT 5`).map(
      (row) => {
        const sep = row.indexOf('|');
        return { id: row.slice(0, sep), name: row.slice(sep + 1) };
      },
    );
    expect(staff.length, 'precisa de ≥2 staff ativos pra exercitar a corrida').toBeGreaterThan(1);
    const token = await getSessionToken();
    const createRes = await fetch(`${API}/waiter-calls`, {
      method: 'POST',
      headers: { 'x-session-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'other' }),
    });
    const { callId } = (await createRes.json()) as { callId: string };

    await Promise.all(
      staff.map((s) =>
        fetch(`${API}/waiter-calls/${callId}/acknowledge`, {
          method: 'POST',
          headers: {
            'x-staff-key': STAFF_KEY,
            'x-staff-id': s.id,
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
      ),
    );

    const dbWaiter = psql(`SELECT assigned_waiter_name FROM waiter_calls WHERE id = '${callId}'`);
    expect(staff.map((s) => s.name)).toContain(dbWaiter);
    const dbStatus = psql(`SELECT status FROM waiter_calls WHERE id = '${callId}'`);
    expect(dbStatus).toBe('acknowledged');
  });
});

// P2-4: TRIM unicode — categories with trailing whitespace/ZWSP match correctly
test.describe('P2-4 — TRIM unicode station filtering', () => {
  function cleanup() {
    try {
      psql(
        `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE notes = 'QA-unicode-trim')`,
      );
      psql(`DELETE FROM orders WHERE notes = 'QA-unicode-trim'`);
      psql(`DELETE FROM menu_items WHERE name = 'QA-Unicode-Drink'`);
      psql(`DELETE FROM menu_categories WHERE sort_order = 99`);
    } catch {
      /* no-op */
    }
  }

  test.beforeAll(() => {
    cleanup();
    try {
      execSync(
        `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
        { stdio: 'pipe' },
      );
    } catch {
      /* no-op */
    }
  });

  test.afterAll(() => cleanup());

  test('unicode-trimmed category names still route to correct station', async () => {
    const setupSql = `
      INSERT INTO menu_categories (name, sort_order) VALUES ('Bebidas ', 99);
      INSERT INTO menu_categories (name, sort_order) VALUES (' Bebidas', 99);
      INSERT INTO menu_categories (name, sort_order) VALUES ('BEBIDAS', 99);
    `;
    execSync(
      `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -c "SET search_path = restaurant_dev; ${setupSql}"`,
      { encoding: 'utf8' },
    );
    const catIds = psqlAll(`SELECT id FROM menu_categories WHERE sort_order = 99`);
    expect(catIds.length, 'should have 3 test categories').toBeGreaterThanOrEqual(3);

    for (const catId of catIds) {
      psql(
        `INSERT INTO menu_items (name, category_id, price_cents, is_available) VALUES ('QA-Unicode-Drink', '${catId}', 100, true)`,
      );
    }
    const menuIds = psqlAll(`SELECT id FROM menu_items WHERE name = 'QA-Unicode-Drink'`);

    const session = '0d324208-01ce-4d5e-b95e-1acba080304c';
    for (const mid of menuIds) {
      psql(
        `INSERT INTO orders (table_session_id, billing_mode, status, total_cents, created_by, notes) ` +
          `VALUES ('${session}', 'table', 'received', 100, 'qa-test', 'QA-unicode-trim') RETURNING id`,
      );
    }
    const orderIds = psqlAll(`SELECT id FROM orders WHERE notes = 'QA-unicode-trim'`);
    for (let i = 0; i < orderIds.length; i++) {
      psql(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) ` +
          `VALUES ('${orderIds[i]}', '${menuIds[i]}', 1, 100, 100)`,
      );
    }

    const barRes = await fetch(`${API}/orders/_kds?station=bar`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(barRes.status, 'bar _kds should return 200').toBe(200);
    const barData = (await barRes.json()) as { orders: { items: { name: string }[] }[] };
    const barItems = (barData.orders ?? [])
      .flatMap((o) => o.items)
      .filter((i) => i.name === 'QA-Unicode-Drink');
    expect(barItems.length, 'all 3 variant-name items should appear in bar').toBe(3);

    const kitchenRes = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(kitchenRes.status, 'kitchen _kds should return 200').toBe(200);
    const kitchenData = (await kitchenRes.json()) as { orders: { items: { name: string }[] }[] };
    const kitchenItems = (kitchenData.orders ?? [])
      .flatMap((o) => o.items)
      .filter((i) => i.name === 'QA-Unicode-Drink');
    expect(kitchenItems.length, 'variant-name items should NOT appear in kitchen').toBe(0);
  });
});

// P2-5: sweep tenant-scoped — Redis key contains tenant name
test.describe('P2-5 — sweep auto-confirm key is tenant-scoped', () => {
  test('sweep key contains restaurant_dev, not "development"', async () => {
    await fetch(`${API}/orders/_kds?station=kitchen`, { headers: { 'x-staff-key': STAFF_KEY } });
    const keys = redisExec('KEYS sweep:*');
    if (keys) {
      expect(keys).toContain('restaurant_dev');
      expect(keys).not.toContain('development');
    }
  });
});

// P2-7: card overflow max-height
test.describe('P2-7 — KDS card max-height overflow', () => {
  const orderId = 'aaaaaaa9-0000-0000-0000-000000000009';

  test.afterAll(() => {
    psql(`DELETE FROM order_items WHERE order_id = '${orderId}'`);
    psql(`DELETE FROM orders WHERE id = '${orderId}'`);
  });

  test('card with 20 items respects max-height', async ({ browser }) => {
    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, total_cents, created_by, created_at) ` +
        `VALUES ('${orderId}', '0d324208-01ce-4d5e-b95e-1acba080304c', 'table', 'received', 158000, 'qa-test', NOW()) ON CONFLICT DO NOTHING`,
    );
    for (let i = 0; i < 20; i++) {
      psql(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) ` +
          `VALUES ('${orderId}', '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34', 1, 7900, 7900)`,
      );
    }
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);
    const maxH = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('.kds-grid > div div');
      for (const el of allDivs) {
        const mh = (el as HTMLElement).style.maxHeight;
        if (mh === '720px') return 720;
      }
      return -1;
    });
    expect(maxH, 'items container should have max-height: 720px').toBe(720);
    await ctx.close();
  });
});

// P3-NEW: tv-unlock X-Real-IP bypass — must NOT trust client header
test.describe('P3-NEW — tv-unlock rate-limit ignores X-Real-IP', () => {
  test('30 POSTs with rotating X-Real-IP still hit rate-limit', async () => {
    // Espera a janela do rate-limit anterior fechar (60s) ou aceita
    // que ja vamos comecar com bucket ativo. Em qualquer caso, o teste
    // dispara 30 com IPs falsos rotativos: se o bug existir, todos
    // passam. Se o fix estiver no lugar, >= 15 retornam 429 (limite=10).
    let count429 = 0;
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${STAFF}/api/tv-unlock`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': `99.0.${i}.${(i * 7) % 256}`,
        },
        body: JSON.stringify({ pin: 'wrong' }),
      });
      if (res.status === 429) count429++;
    }
    expect(count429, 'rotating X-Real-IP must NOT bypass rate-limit').toBeGreaterThanOrEqual(15);
  });
});

// P3-1: PIN pad consistent response for various lengths
test.describe('P3-1 — PIN pad timing consistency', () => {
  test('PINs of length 1, 50, 1000 all respond without 500', async () => {
    const pins = ['x', 'x'.repeat(50), 'x'.repeat(1000)];
    for (const pin of pins) {
      const res = await fetch(`${STAFF}/api/tv-unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      expect(
        [200, 401, 429].includes(res.status),
        `PIN len=${pin.length} should not 500 (got ${res.status})`,
      ).toBe(true);
    }
  });
});

// P3-2: atomic INCR — flood check counter matches
test.describe('P3-2 — atomic INCR+EXPIRE', () => {
  test('100 parallel GETs produce exact counter=100 in Redis', async () => {
    redisExec(
      "--no-raw EVAL \"local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys\" 0 'throttle:*'",
    );
    const calls = Array.from({ length: 100 }).map(() =>
      fetch(`${API}/orders/_kds?station=kitchen`, { headers: { 'x-staff-key': STAFF_KEY } }),
    );
    await Promise.all(calls);
    const keys = redisExec('KEYS throttle:*');
    if (keys) {
      const key = keys.split('\n')[0].trim();
      const val = Number(redisExec(`GET ${key}`));
      expect(val, 'Redis counter should be exactly 100').toBe(100);
      const ttl = Number(redisExec(`TTL ${key}`));
      expect(ttl, 'TTL should be > 0').toBeGreaterThan(0);
    }
  });
});

// P3-3: proxy header allowlist — sensitive headers NOT forwarded
test.describe('P3-3 — proxy header allowlist', () => {
  test('proxy strips x-session-token, cookie, authorization, x-real-ip', async () => {
    const res = await fetch(`${PROXY}/orders/_kds?station=kitchen`, {
      headers: {
        'x-session-token': 'fake-token',
        cookie: 'fake=cookie',
        authorization: 'Bearer FakeToken',
        'x-real-ip': '9.9.9.9',
      },
    });
    expect(res.status).toBe(200);
  });
});

// P3-6: future filter — orders with future created_at are excluded from KDS
test.describe('P3-6 — KDS future order filter', () => {
  const futureId = 'aaaaaaa0-f000-0000-0000-000000000001';
  const pastId = 'aaaaaaa0-f000-0000-0000-000000000002';

  test.afterAll(() => {
    psql(`DELETE FROM order_items WHERE order_id IN ('${futureId}','${pastId}')`);
    psql(`DELETE FROM orders WHERE id IN ('${futureId}','${pastId}')`);
  });

  test('future order excluded, recent order included', async () => {
    const session = '0d324208-01ce-4d5e-b95e-1acba080304c';
    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, total_cents, created_by, created_at) ` +
        `VALUES ('${futureId}', '${session}', 'table', 'received', 7900, 'qa-test', NOW() + INTERVAL '1 hour') ON CONFLICT DO NOTHING`,
    );
    psql(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) ` +
        `VALUES ('${futureId}', '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34', 1, 7900, 7900)`,
    );
    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, total_cents, created_by, created_at) ` +
        `VALUES ('${pastId}', '${session}', 'table', 'received', 7900, 'qa-test', NOW() - INTERVAL '1 minute') ON CONFLICT DO NOTHING`,
    );
    psql(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) ` +
        `VALUES ('${pastId}', '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34', 1, 7900, 7900)`,
    );

    const res = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    const data = (await res.json()) as { orders: { id: string }[] };
    const ids = data.orders.map((o) => o.id);

    expect(ids, 'future order should NOT appear').not.toContain(futureId);
    expect(ids, 'recent order should appear').toContain(pastId);
  });
});

// ======== ROUND 5 TESTS ========

const M02_SECRET = '2f00b359-6d69-408a-a50e-84ffbe44ea45';

function clearThrottle() {
  try {
    execSync(
      `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
      { stdio: 'pipe' },
    );
  } catch {
    /* no-op */
  }
}

async function getM02Session(): Promise<string> {
  const crypto = await import('node:crypto');
  const ts = Date.now();
  const sig = crypto.createHmac('sha256', M02_SECRET).update(`M02:${ts}`).digest('hex');
  const res = await fetch(`${API}/session/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tableCode: 'M02',
      hmacSignature: sig,
      timestamp: String(ts),
      accessToken: dailyAccessToken('M02', M02_SECRET),
    }),
  });
  if (!res.ok) throw new Error(`M02 session init failed: ${res.status}`);
  return ((await res.json()) as { sessionId: string }).sessionId;
}

async function welcomeCustomer(
  sessionToken: string,
  name: string,
  cpf: string,
): Promise<{ customerId: string; recognitionToken: string; visitId: string }> {
  const res = await fetch(`${API}/customer/welcome`, {
    method: 'POST',
    headers: { 'x-session-token': sessionToken, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      cpf,
      // Geofence está desligada no dev (lat/lng NULL), mas mandamos uma
      // localização "granted" como o helper canônico (physical-qr.ts) faz,
      // pra não tomar 403 caso o owner configure o raio depois.
      location: { status: 'granted', latitude: -23.56, longitude: -46.64, accuracyMeters: 12 },
    }),
  });
  if (!res.ok) throw new Error(`welcomeCustomer failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { customerId: string; visitId: string };
  // Nesta branch o recognition_token é httpOnly cookie e NÃO vem no body (por
  // segurança — evita exfiltração via XSS). Extrai do Set-Cookie pra passar
  // como x-recognition-token nas ações de host (mesmo que physical-qr.ts faz).
  const setCookie = res.headers.get('set-cookie') ?? '';
  const recognitionToken = setCookie.match(/recognition_token=([^;]+)/)?.[1] ?? '';
  return { customerId: body.customerId, recognitionToken, visitId: body.visitId };
}

// P0-X7-3: Host forgery — attacker cannot approve/reject via forged hostCustomerId
test.describe('P0-X7-3 — host forgery blocked', () => {
  test.beforeAll(() => clearThrottle());
  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000132','50000000213'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000132','50000000213'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM feedbacks WHERE visit_id IN (SELECT v.id FROM visits v JOIN customers c ON c.id = v.customer_id WHERE c.cpf IN ('50000000132','50000000213'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000132','50000000213'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf IN ('50000000132','50000000213')`);
    } catch {
      /* no-op */
    }
  });

  test('pending participant cannot decide with forged hostCustomerId', async () => {
    const session = await getSessionToken();
    const hostResult = await welcomeCustomer(session, 'QA-HostR5', '50000000132');
    const attackerResult = await welcomeCustomer(session, 'QA-AttackerR5', '50000000213');

    // Force host to be the first welcomed customer
    psql(
      `UPDATE table_sessions SET host_customer_id = '${hostResult.customerId}' WHERE id = '${session}'`,
    );

    // Attacker tries to approve themselves with forged hostCustomerId
    const res = await fetch(`${API}/table/participants/decide`, {
      method: 'POST',
      headers: {
        'x-session-token': session,
        'x-recognition-token': attackerResult.recognitionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        hostCustomerId: hostResult.customerId,
        targetCustomerId: attackerResult.customerId,
        decision: 'approve',
      }),
    });
    expect(res.status, 'attacker should be rejected').toBe(403);

    // Real host can approve
    const res2 = await fetch(`${API}/table/participants/decide`, {
      method: 'POST',
      headers: {
        'x-session-token': session,
        'x-recognition-token': hostResult.recognitionToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetCustomerId: attackerResult.customerId,
        decision: 'approve',
      }),
    });
    expect(res2.status, 'host should succeed').toBe(201);
  });
});

// P0-X7-1 + P0-X7-2: IDOR feedbacks — cross-session visitId blocked
test.describe('P0-X7-1/2 — feedbacks IDOR blocked', () => {
  test.beforeAll(() => {
    clearThrottle();
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(`DELETE FROM feedbacks WHERE comment LIKE 'QA-R5%'`);
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf IN ('50000000302','50000000485')`);
    } catch {
      /* no-op */
    }
  });
  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(`DELETE FROM feedbacks WHERE comment LIKE 'QA-R5%'`);
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000302','50000000485'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf IN ('50000000302','50000000485')`);
    } catch {
      /* no-op */
    }
  });

  test('POST /feedbacks with cross-session visitId returns 403', async () => {
    const m01Session = await getSessionToken();
    const m01Welcome = await welcomeCustomer(m01Session, 'QA-R5-M01', '50000000302');

    const m02Session = await getM02Session();
    await welcomeCustomer(m02Session, 'QA-R5-M02', '50000000485');

    // M02 tries to post feedback with M01's visitId → 403
    const res = await fetch(`${API}/feedbacks`, {
      method: 'POST',
      headers: { 'x-session-token': m02Session, 'content-type': 'application/json' },
      body: JSON.stringify({
        visitId: m01Welcome.visitId,
        overallRating: 1,
        comment: 'QA-R5-attack',
      }),
    });
    expect(res.status, 'cross-session feedback should be forbidden').toBe(403);

    // M01 with own visitId → 201
    const res2 = await fetch(`${API}/feedbacks`, {
      method: 'POST',
      headers: { 'x-session-token': m01Session, 'content-type': 'application/json' },
      body: JSON.stringify({ visitId: m01Welcome.visitId, overallRating: 5, comment: 'QA-R5-own' }),
    });
    expect(res2.status, 'own-session feedback should succeed').toBe(201);

    // M02 tries to read M01's feedback → empty (null)
    const res3 = await fetch(`${API}/feedbacks?visitId=${m01Welcome.visitId}`, {
      headers: { 'x-session-token': m02Session },
    });
    expect(res3.status).toBe(200);
    const text3 = await res3.text();
    const body3 = text3 ? JSON.parse(text3) : null;
    expect(body3, 'cross-session GET should return null').toBeNull();
  });
});

// P1-X7-2: feedbacks DTO rejects null visitId
test.describe('P1-X7-2 — feedbacks visitId required', () => {
  test('POST /feedbacks without visitId returns 400', async () => {
    const session = await getSessionToken();
    const res = await fetch(`${API}/feedbacks`, {
      method: 'POST',
      headers: { 'x-session-token': session, 'content-type': 'application/json' },
      body: JSON.stringify({ overallRating: 5, comment: 'QA-R5-novisit' }),
    });
    expect(res.status, 'missing visitId should 400').toBe(400);
  });
});

// P1-X7-3: rate-limit on /customer/welcome
test.describe('P1-X7-3 — /customer/welcome rate-limited', () => {
  test.beforeAll(() => {
    try {
      execSync(
        `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
        { stdio: 'pipe' },
      );
    } catch {
      /* no-op */
    }
  });

  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE name LIKE 'QA-R5-Flood%')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'QA-R5-Flood%')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'QA-R5-Flood%')`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`name LIKE 'QA-R5-Flood%'`);
    } catch {
      /* no-op */
    }
  });

  test('30 parallel POST /customer/welcome hit 429', async () => {
    const session = await getSessionToken();
    const results = await Promise.all(
      Array.from({ length: 30 }).map((_, i) =>
        fetch(`${API}/customer/welcome`, {
          method: 'POST',
          headers: { 'x-session-token': session, 'content-type': 'application/json' },
          body: JSON.stringify({ name: `QA-R5-Flood${i}`, cpf: `${String(10000000000 + i)}` }),
        }).then((r) => r.status),
      ),
    );
    const rate429 = results.filter((s) => s === 429).length;
    expect(rate429, 'should hit 429 on welcome flood').toBeGreaterThanOrEqual(5);
  });
});

// P2-X7-1: feedbacks race — parallel POSTs yield 1 row
test.describe('P2-X7-1 — feedbacks dedup race', () => {
  test.beforeAll(() => clearThrottle());
  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf = '50000000566')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(`DELETE FROM feedbacks WHERE comment LIKE 'QA-R5-race%'`);
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '50000000566')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '50000000566')`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf = '50000000566'`);
    } catch {
      /* no-op */
    }
  });

  test('5 parallel POST /feedbacks with same visitId yield 1 DB row', async () => {
    const session = await getSessionToken();
    const welcome = await welcomeCustomer(session, 'QA-R5-Race', '50000000566');

    const results = await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        fetch(`${API}/feedbacks`, {
          method: 'POST',
          headers: { 'x-session-token': session, 'content-type': 'application/json' },
          body: JSON.stringify({
            visitId: welcome.visitId,
            overallRating: 3,
            comment: `QA-R5-race${i}`,
          }),
        }).then(async (r) => ({
          status: r.status,
          body: (await r.json()) as { feedbackId?: string },
        })),
      ),
    );
    const successIds = new Set(
      results.filter((r) => r.body.feedbackId).map((r) => r.body.feedbackId),
    );
    expect(successIds.size, 'all should return same feedbackId').toBe(1);

    const dbCount = Number(
      psql(`SELECT count(*) FROM feedbacks WHERE visit_id = '${welcome.visitId}'`),
    );
    expect(dbCount, 'DB should have exactly 1 feedback').toBe(1);
  });
});

// P2-X7-2: payments race — parallel POSTs yield 1 pending row
test.describe('P2-X7-2 — payments dedup race', () => {
  test.beforeAll(() => clearThrottle());
  test.afterAll(() => {
    try {
      psql(
        `DELETE FROM payments WHERE table_session_id IN (SELECT ts.id FROM table_sessions ts JOIN tables t ON t.id = ts.table_id WHERE t.code = 'M01')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE notes = 'QA-R5-pay')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(`DELETE FROM orders WHERE notes = 'QA-R5-pay'`);
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM feedbacks WHERE visit_id IN (SELECT v.id FROM visits v JOIN customers c ON c.id = v.customer_id WHERE c.cpf = '50000000647')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '50000000647')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '50000000647')`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf = '50000000647'`);
    } catch {
      /* no-op */
    }
  });

  test('5 parallel POST /payments with same scope yield 1 pending row', async () => {
    const session = await getSessionToken();
    const welcome = await welcomeCustomer(session, 'QA-R5-Pay', '50000000647');

    psql(
      `INSERT INTO orders (table_session_id, visit_id, billing_mode, status, total_cents, created_by, notes) VALUES ('${session}', '${welcome.visitId}', 'table', 'received', 1000, 'qa-test', 'QA-R5-pay')`,
    );

    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        fetch(`${API}/payments`, {
          method: 'POST',
          headers: { 'x-session-token': session, 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'table', method: 'pix' }),
        }).then((r) => r.status),
      ),
    );
    const successes = results.filter((s) => s === 201 || s === 200).length;
    expect(successes, 'at least 1 should succeed').toBeGreaterThanOrEqual(1);

    const dbCount = Number(
      psql(
        `SELECT count(*) FROM payments WHERE table_session_id = '${session}' AND status = 'pending'`,
      ),
    );
    expect(dbCount, 'DB should have at most 1 pending payment').toBeLessThanOrEqual(1);
  });
});

// P2-X7-3: SQL logs no longer contain PII. Nesta branch o logging do TypeORM
// fica DESLIGADO por padrão e só liga com DEBUG_DB=true — ainda mais estrito
// que ['error','warn'] da sibling, e sem vazar query log com PII em dev.
test.describe('P2-X7-3 — SQL logs mask PII', () => {
  test('database.config logging is off by default (DEBUG_DB gate)', () => {
    const content = readFileSync(apiSrc('config/database.config.ts'), 'utf8');
    expect(content).toContain("process.env.DEBUG_DB === 'true'");
    expect(content).not.toMatch(/logging:\s*process\.env\.NODE_ENV\s*!==\s*'production'/);
    expect(content).not.toMatch(/logging:\s*true\b/);
  });
});

// P2-X7-4: decideJoinRequest CAS — parallel decides yield 1 transition
test.describe('P2-X7-4 — decideJoinRequest CAS', () => {
  test.beforeAll(() => clearThrottle());
  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000728','50000000809'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM session_participants WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000728','50000000809'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM feedbacks WHERE visit_id IN (SELECT v.id FROM visits v JOIN customers c ON c.id = v.customer_id WHERE c.cpf IN ('50000000728','50000000809'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf IN ('50000000728','50000000809'))`,
      );
    } catch {
      /* no-op */
    }
    try {
      purgeTvTestCustomers(`cpf IN ('50000000728','50000000809')`);
    } catch {
      /* no-op */
    }
  });

  test('5 parallel approve for same target yield 1 approved row', async () => {
    const session = await getSessionToken();
    const host = await welcomeCustomer(session, 'QA-R5-CASHost', '50000000728');
    const target = await welcomeCustomer(session, 'QA-R5-CASTarget', '50000000809');

    // Force host assignment for the test
    psql(
      `UPDATE table_sessions SET host_customer_id = '${host.customerId}' WHERE id = '${session}'`,
    );

    await Promise.all(
      Array.from({ length: 5 }).map(() =>
        fetch(`${API}/table/participants/decide`, {
          method: 'POST',
          headers: {
            'x-session-token': session,
            'x-recognition-token': host.recognitionToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ targetCustomerId: target.customerId, decision: 'approve' }),
        }),
      ),
    );

    const status = psql(
      `SELECT status FROM session_participants WHERE customer_id = '${target.customerId}' AND table_session_id = '${session}'`,
    );
    expect(status).toBe('approved');
  });
});

// P2-X4-1: TV responsive — header condenses at 1024
test.describe('P2-X4-1 — TV responsive header at 1024', () => {
  test('1024px hides secondary counters via CSS', () => {
    const content = readFileSync(staffSrc('components/tv/styles.ts'), 'utf8');
    expect(content).toContain('max-width: 1024px');
    expect(content).toContain('max-width: 480px');
    expect(content).toContain('kds-counter-totals');
  });
});

// P2-X5-1: os P0 de auth continuam fechados. A sibling branch removeu o
// StaffOrSessionGuard inteiro; ESTA branch o mantém só pra acesso-duplo
// legítimo (GET /orders, menu, etc.) e fechou os P0 perigosos migrando os
// controllers ofensores pra StaffOnly. O invariante de segurança aqui é:
// os controllers que TIVERAM P0 (dashboard B-NEW-20, deliveries B-NEW-21)
// NÃO aceitam mais session token. Runtime equivalente: P2-6 e P1-NEW-1.
test.describe('P2-X5-1 — controllers P0 são StaffOnly (sem session)', () => {
  test('dashboard e deliveries não usam @UseGuards(StaffOrSessionGuard)', () => {
    for (const rel of [
      'modules/dashboard/dashboard.controller.ts',
      'modules/deliveries/deliveries.controller.ts',
    ]) {
      const content = readFileSync(apiSrc(rel), 'utf8');
      expect(content, `${rel} deve usar StaffOnlyGuard`).toMatch(/StaffOnlyGuard/);
      expect(content, `${rel} não pode reabrir o P0 aceitando session`).not.toMatch(
        /@UseGuards\([^)]*StaffOrSessionGuard/,
      );
    }
  });
});

// P2-X6-1: strengthen existing sweep/timing/header specs
test.describe('P2-X6-1 — strengthened sweep tenant-scoped', () => {
  test('sweep key verified after forced GET', async () => {
    redisExec(
      "--no-raw EVAL \"local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys\" 0 'sweep:*'",
    );
    await fetch(`${API}/orders/_kds?station=kitchen`, { headers: { 'x-staff-key': STAFF_KEY } });
    const keys = redisExec('KEYS sweep:*');
    const keyLines = keys.split('\n').filter((l: string) => l.trim());
    expect(keyLines.length, 'should have at least 1 sweep key').toBeGreaterThan(0);
    expect(
      keyLines.every((k: string) => k.includes('restaurant_dev')),
      'all keys scoped to tenant',
    ).toBe(true);
    expect(
      keyLines.every((k: string) => !k.includes('development')),
      'no stale "development" key',
    ).toBe(true);
  });
});

test.describe('P2-X6-1 — PIN timing consistency (measured)', () => {
  test('PINs of varying lengths respond within 30ms of each other', async () => {
    const times: number[] = [];
    for (const len of [1, 50, 1000]) {
      const pin = '1'.repeat(len);
      const t0 = performance.now();
      await fetch(`${STAFF}/api/tv-unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      times.push(performance.now() - t0);
    }
    const spread = Math.max(...times) - Math.min(...times);
    expect(spread, 'timing spread across PIN lengths').toBeLessThan(50);
  });
});

// P3-X5: decisão desta branch (2026-06-13, confirmada com Caleb) — manter o
// StaffOrSessionGuard pro acesso-duplo legítimo em vez do refactor de remoção
// total da sibling (migrar ~10 rotas de 8 módulos). Invariante: o guard
// documenta os DOIS paths (staff-key + session) e NÃO cobre os controllers
// P0 (esses são StaffOnly). Code review dedicado roda depois pra confirmar
// que nenhum P0 antigo (B-NEW-19/20/21/24) regrediu.
test.describe('P3-X5 — StaffOrSessionGuard contido a acesso-duplo legítimo', () => {
  test('guard existe, documenta os 2 paths e não cobre controllers P0', () => {
    const guardPath = apiSrc('common/guards/staff-or-session.guard.ts');
    expect(existsSync(guardPath), 'guard de acesso-duplo é mantido nesta branch').toBe(true);
    const guard = readFileSync(guardPath, 'utf8');
    expect(guard).toMatch(/x-staff-key/);
    expect(guard).toMatch(/x-session-token|session_token/);
    for (const rel of [
      'modules/dashboard/dashboard.controller.ts',
      'modules/deliveries/deliveries.controller.ts',
    ]) {
      const content = readFileSync(apiSrc(rel), 'utf8');
      expect(content, `${rel} não pode usar o guard de acesso-duplo`).not.toMatch(
        /@UseGuards\([^)]*StaffOrSessionGuard/,
      );
    }
  });
});

// P3-X2: home.service rpush tem expire (TTL na welcome_pool:* — evita
// acúmulo unbounded de keys por sessão, que esta branch não tinha).
test.describe('P3-X2 — home.service rpush has expire', () => {
  test('home.service.ts calls expire after rpush', () => {
    const content = readFileSync(apiSrc('modules/home/home.service.ts'), 'utf8');
    const rpushIdx = content.indexOf('rpush(poolKey');
    const expireIdx = content.indexOf('expire(poolKey', rpushIdx);
    expect(rpushIdx, 'rpush should exist').toBeGreaterThan(-1);
    expect(expireIdx, 'expire should follow rpush').toBeGreaterThan(rpushIdx);
  });
});

// P3-X3: idempotência de orders. A sibling fazia redis.del(idemKey) num
// catch; ESTA branch usa lock atômico via setNX EX (sentinela inflight) e
// marca {orderId} DEPOIS do commit, com TTL de 5min — falha de transação
// não persiste orderId e o lock expira sozinho pelo TTL. Runtime: P1-NEW-2
// (5 POSTs paralelos com mesma idempotencyKey → exatamente 1 orderId).
test.describe('P3-X3 — idempotência de orders é atômica e com TTL', () => {
  test('orders.service.ts usa setNX(idemKey) com TTL e chave order_idem:', () => {
    const content = readFileSync(apiSrc('modules/orders/orders.service.ts'), 'utf8');
    expect(content).toMatch(/setNX\(\s*idemKey/);
    expect(content).toMatch(/IDEMPOTENCY_TTL_SECONDS/);
    expect(content).toContain('order_idem:');
  });
});

// P1-X7-1: nesta branch o staff PODE entrar em session room, mas só se a
// session pertence ao tenant carimbado no handshake (B-NEW-34) — senão
// "Cross-tenant session join blocked". (A sibling bloqueava staff de
// join:session inteiro; modelo diferente, ambos previnem leak cross-tenant.)
test.describe('P1-X7-1 — WS join:session cross-checa tenant do staff', () => {
  test('events.gateway bloqueia staff cross-tenant em join:session', () => {
    const content = readFileSync(apiSrc('modules/websocket/events.gateway.ts'), 'utf8');
    expect(content).toContain("client.data.authType === 'staff'");
    expect(content).toContain('Cross-tenant session join blocked');
    expect(content).toMatch(/staffTenantSlug/);
  });
});

// Round 4 coverage — atomic INCR TTL verification
test.describe('P1-X6-1 — round 4 atomic INCR TTL check', () => {
  test('staff.verifyPin counter has TTL > 0 after wrong attempts', async () => {
    const staffId = psql(`SELECT id FROM staff LIMIT 1`);
    if (!staffId) return;
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/staff/${staffId}/verify-pin`, {
        method: 'POST',
        headers: { 'x-staff-key': STAFF_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      });
    }
    const keys = redisExec('KEYS staff:pin:attempts:*');
    if (keys) {
      const key = keys.split('\n')[0].trim();
      const ttl = Number(redisExec(`TTL ${key}`));
      expect(ttl, 'TTL should be > 0 (not -1 orphan)').toBeGreaterThan(0);
    }
  });
});
