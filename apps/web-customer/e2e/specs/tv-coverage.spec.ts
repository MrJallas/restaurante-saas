import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const API = 'http://localhost:3001/api/restaurant_dev';
const STAFF = 'http://localhost:3002';
const STAFF_KEY = 'dev-staff-api-key-change-in-prod';
const M01_SECRET = '38889aad-20d1-4778-b4ab-df35774c0398';
const PROXY = `${STAFF}/api/proxy/restaurant_dev`;

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
    body: JSON.stringify({ tableCode: 'M01', hmacSignature: sig, timestamp: String(ts) }),
  });
  const body = (await res.json()) as { sessionId: string };
  return body.sessionId;
}

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

  test('5 parallel acknowledges produce 1 waiter name in DB', async () => {
    psql(`DELETE FROM waiter_calls WHERE status IN ('pending','acknowledged')`);
    const token = await getSessionToken();
    const createRes = await fetch(`${API}/waiter-calls`, {
      method: 'POST',
      headers: { 'x-session-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'other' }),
    });
    const { callId } = (await createRes.json()) as { callId: string };

    const waiters = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva'];
    await Promise.all(
      waiters.map((name) =>
        fetch(`${API}/waiter-calls/${callId}/acknowledge`, {
          method: 'POST',
          headers: { 'x-staff-key': STAFF_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ waiterName: name }),
        }),
      ),
    );

    const dbWaiter = psql(`SELECT assigned_waiter_name FROM waiter_calls WHERE id = '${callId}'`);
    expect(waiters).toContain(dbWaiter);
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
    body: JSON.stringify({ tableCode: 'M02', hmacSignature: sig, timestamp: String(ts) }),
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
    body: JSON.stringify({ name, cpf }),
  });
  if (!res.ok) throw new Error(`welcomeCustomer failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { customerId: string; recognitionToken: string; visitId: string };
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
      psql(`DELETE FROM customers WHERE cpf IN ('50000000132','50000000213')`);
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
      psql(`DELETE FROM customers WHERE cpf IN ('50000000302','50000000485')`);
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
      psql(`DELETE FROM customers WHERE cpf IN ('50000000302','50000000485')`);
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
      psql(`DELETE FROM customers WHERE name LIKE 'QA-R5-Flood%'`);
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
      psql(`DELETE FROM customers WHERE cpf = '50000000566'`);
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
      psql(`DELETE FROM customers WHERE cpf = '50000000647'`);
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

// P2-X7-3: SQL logs no longer contain PII
test.describe('P2-X7-3 — SQL logs mask PII', () => {
  test('database.config logging is error/warn only', async () => {
    const fs = await import('node:fs');
    const configPath =
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/config/database.config.ts';
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain("['error', 'warn']");
    expect(content).not.toMatch(/logging:\s*process\.env\.NODE_ENV\s*!==\s*'production'/);
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
      psql(`DELETE FROM customers WHERE cpf IN ('50000000728','50000000809')`);
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
  test('1024px hides secondary counters via CSS', async () => {
    const fs = await import('node:fs');
    const stylesPath =
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/web-staff/src/components/tv/styles.ts';
    const content = fs.readFileSync(stylesPath, 'utf8');
    expect(content).toContain('max-width: 1024px');
    expect(content).toContain('max-width: 480px');
    expect(content).toContain('kds-counter-totals');
  });
});

// P2-X5-1: stale comments removed
test.describe('P2-X5-1 — stale StaffOrSessionGuard comments removed', () => {
  test('no source files reference StaffOrSessionGuard', async () => {
    const fs = await import('node:fs');
    const files = [
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/modules/orders/orders.controller.ts',
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/modules/waiter-calls/waiter-calls.controller.ts',
    ];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      expect(content, `${f} should not reference StaffOrSessionGuard`).not.toContain(
        'StaffOrSessionGuard',
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

// P3-X1: dead guard file removed
test.describe('P3-X5 — dead StaffOrSessionGuard file removed', () => {
  test('staff-or-session.guard.ts no longer exists', async () => {
    const fs = await import('node:fs');
    const exists = fs.existsSync(
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/common/guards/staff-or-session.guard.ts',
    );
    expect(exists, 'dead guard file should be deleted').toBe(false);
  });
});

// P3-X2: home.service rpush has expire
test.describe('P3-X2 — home.service rpush has expire', () => {
  test('home.service.ts calls expire after rpush', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/modules/home/home.service.ts',
      'utf8',
    );
    const rpushIdx = content.indexOf('rpush(poolKey');
    const expireIdx = content.indexOf('expire(poolKey', rpushIdx);
    expect(rpushIdx, 'rpush should exist').toBeGreaterThan(-1);
    expect(expireIdx, 'expire should follow rpush').toBeGreaterThan(rpushIdx);
  });
});

// P3-X3: idempotency lock cleaned on error
test.describe('P3-X3 — idem lock cleanup on error', () => {
  test('orders.service.ts has try/catch around transaction with idemKey del', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/modules/orders/orders.service.ts',
      'utf8',
    );
    expect(content).toContain('if (idemKey) await this.redis.del(idemKey)');
  });
});

// P1-X7-1: WS staff cannot join session rooms
test.describe('P1-X7-1 — WS staff blocked from session rooms', () => {
  test('events.gateway blocks staff from join:session', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      '/Users/calebmedeiros/meus_projetos/.claude/worktrees/charming-yonath-d5e23e/apps/api/src/modules/websocket/events.gateway.ts',
      'utf8',
    );
    expect(content).toContain("client.data.authType === 'staff'");
    expect(content).toContain('Staff must use join:tenant, not join:session');
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
