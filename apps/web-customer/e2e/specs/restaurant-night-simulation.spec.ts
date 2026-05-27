import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  API_BASE_URL,
  DEFAULT_SLUG,
  STAFF_BASE_URL,
  activeSessions,
  fillWelcome,
  latestScanRequest,
  openCustomerViaQr,
  participantsForSession,
  psql,
  psqlJson,
  resetQrTables,
  scanRequests,
  staffByRole,
  staffFetch,
  waitFor,
} from '../helpers/physical-qr';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let cpfSeed = Math.floor(Date.now() % 100_000);
let ipSeed = Math.floor(Date.now() % 60_000);

interface RuntimePage {
  context: BrowserContext;
  page: Page;
}

interface MenuItemRow {
  id: string;
  name: string;
  price_cents: number;
}

interface OrderResponse {
  id: string;
  orderId: string;
  status: string;
  totalCents: number;
}

interface WaiterCallResponse {
  id: string;
  callId?: string;
  status: string;
}

function freshCpf(): string {
  cpfSeed += 1;
  const base = String(830000000 + cpfSeed).slice(0, 9);
  const d1 = cpfDigit(base);
  const d2 = cpfDigit(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

function cpfDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += Number(input[i]) * (input.length + 1 - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

function nextIp(secondOctet: number): string {
  ipSeed += 1;
  const normalized = Math.abs(ipSeed) % 65_536;
  return `198.${secondOctet}.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

async function routeStaffApiToLocalhost(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.port === '3001' &&
      requestUrl.hostname !== 'localhost' &&
      requestUrl.hostname !== '127.0.0.1'
    ) {
      requestUrl.hostname = 'localhost';
      await route.continue({ url: requestUrl.toString() });
      return;
    }
    await route.continue();
  });
}

async function newMobileCustomer(browser: Browser, label: string): Promise<RuntimePage> {
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': nextIp(21) },
  });
  const page = await context.newPage();
  await page.setDefaultTimeout(15_000);
  await page.addInitScript((name) => {
    window.sessionStorage.setItem('e2e:actor', name);
  }, label);
  return { context, page };
}

async function newStaffSurface(
  browser: Browser,
  staff: { id: string; role: string },
  viewport: { width: number; height: number },
): Promise<RuntimePage> {
  const context = await browser.newContext({
    viewport,
    extraHTTPHeaders: { 'x-forwarded-for': nextIp(22) },
  });
  await context.addInitScript(
    ({ staffId, role }) => {
      window.localStorage.setItem('staffId', staffId);
      window.localStorage.setItem('staffRole', role);
    },
    { staffId: staff.id, role: staff.role },
  );
  const page = await context.newPage();
  await page.setDefaultTimeout(15_000);
  await routeStaffApiToLocalhost(page);
  return { context, page };
}

function cleanupNightTables(): void {
  resetQrTables(['QRTEST91', 'QRTEST92']);
  psql(`
    WITH target_sessions AS (
      SELECT ts.id
        FROM restaurant_dev.table_sessions ts
        JOIN restaurant_dev.tables t ON t.id = ts.table_id
       WHERE t.code IN ('QRTEST91', 'QRTEST92')
    )
    UPDATE restaurant_dev.orders
       SET status = CASE
             WHEN status IN ('delivered', 'cancelled') THEN status
             ELSE 'delivered'
           END,
           updated_at = now()
     WHERE table_session_id IN (SELECT id FROM target_sessions);

    WITH target_sessions AS (
      SELECT ts.id
        FROM restaurant_dev.table_sessions ts
        JOIN restaurant_dev.tables t ON t.id = ts.table_id
       WHERE t.code IN ('QRTEST91', 'QRTEST92')
    )
    UPDATE restaurant_dev.waiter_calls
       SET status = CASE
             WHEN status IN ('resolved', 'cancelled') THEN status
             ELSE 'resolved'
           END,
           resolved_at = COALESCE(resolved_at, now())
     WHERE table_session_id IN (SELECT id FROM target_sessions);
  `);
}

function pickMenuItems(): MenuItemRow[] {
  const items = psqlJson<MenuItemRow>(
    `SELECT id, name, price_cents
       FROM restaurant_dev.menu_items
      WHERE is_available = true
      ORDER BY sort_order, name
      LIMIT 6`,
  );
  if (items.length < 3) {
    throw new Error('Menu fixture precisa de pelo menos 3 itens disponiveis.');
  }
  return items;
}

async function createAndConfirmOrder(input: {
  sessionId: string;
  item: MenuItemRow;
  quantity: number;
  notes: string;
}): Promise<OrderResponse> {
  const create = await fetch(`${API_BASE_URL}/${DEFAULT_SLUG}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-session-token': input.sessionId,
    },
    body: JSON.stringify({
      billingMode: 'table',
      notes: input.notes,
      idempotencyKey: randomUUID(),
      items: [
        {
          menuItemId: input.item.id,
          quantity: input.quantity,
          notes: input.notes,
        },
      ],
    }),
  });
  const created = (await create.json()) as Partial<OrderResponse> & { message?: string };
  expect(create.status, `create order failed: ${JSON.stringify(created)}`).toBe(201);
  const createdOrderId = created.id ?? created.orderId;
  expect(createdOrderId, `create order did not return id/orderId: ${JSON.stringify(created)}`).toBeTruthy();

  const confirm = await fetch(`${API_BASE_URL}/${DEFAULT_SLUG}/orders/${createdOrderId}/confirm`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-session-token': input.sessionId,
    },
    body: JSON.stringify({}),
  });
  const confirmed = (await confirm.json()) as Partial<OrderResponse> & { message?: string };
  expect([200, 201], `confirm order failed: ${JSON.stringify(confirmed)}`).toContain(confirm.status);
  const resolvedOrderId = confirmed.id ?? confirmed.orderId ?? createdOrderId!;
  return {
    id: resolvedOrderId,
    orderId: confirmed.orderId ?? resolvedOrderId,
    status: confirmed.status ?? created.status ?? 'received',
    totalCents: confirmed.totalCents ?? created.totalCents ?? 0,
  };
}

async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const response = await staffFetch(`/${DEFAULT_SLUG}/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, changedBy: 'night-e2e' }),
  });
  expect(
    [200, 201],
    `update order ${orderId} -> ${status} failed: ${response.status} ${JSON.stringify(response.body)}`,
  ).toContain(response.status);
}

async function createWaiterCall(sessionId: string, reason: string): Promise<WaiterCallResponse> {
  const response = await fetch(`${API_BASE_URL}/${DEFAULT_SLUG}/waiter-calls`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-session-token': sessionId,
    },
    body: JSON.stringify({ reason }),
  });
  const body = (await response.json()) as Partial<WaiterCallResponse> & { message?: string };
  expect(response.status, `create waiter call failed: ${JSON.stringify(body)}`).toBe(201);
  const callId = body.id ?? body.callId;
  expect(callId, `waiter call did not return id/callId: ${JSON.stringify(body)}`).toBeTruthy();
  return {
    id: callId!,
    callId: body.callId ?? callId!,
    status: body.status ?? 'pending',
  };
}

async function closeRuntimePages(pages: RuntimePage[]): Promise<void> {
  await Promise.all(
    pages.map(async ({ context }) => {
      await context.close().catch(() => undefined);
    }),
  );
}

test('noite realista: 3 clientes iOS + recepcao + garcom + gerente + cozinha + historico', async ({
  browser,
}) => {
  cleanupNightTables();
  const [hostStaff, waiterStaff, managerStaff] = await Promise.all([
    staffByRole('host'),
    staffByRole('waiter'),
    staffByRole('manager'),
  ]);
  const menuItems = pickMenuItems();

  const opened: RuntimePage[] = [];
  const customerA = await newMobileCustomer(browser, 'ios-sim-1-host');
  const customerB = await newMobileCustomer(browser, 'ios-sim-2-guest');
  const customerC = await newMobileCustomer(browser, 'ios-sim-3-table-92');
  const reception = await newStaffSurface(browser, hostStaff, { width: 430, height: 932 });
  const waiter = await newStaffSurface(browser, waiterStaff, { width: 430, height: 932 });
  const manager = await newStaffSurface(browser, managerStaff, { width: 1280, height: 900 });
  const kitchen = await newStaffSurface(browser, managerStaff, { width: 1440, height: 920 });
  const tableHistory = await newStaffSurface(browser, managerStaff, { width: 430, height: 932 });
  opened.push(customerA, customerB, customerC, reception, waiter, manager, kitchen, tableHistory);

  try {
    await reception.page.goto(
      `${STAFF_BASE_URL}/host?tenant=${DEFAULT_SLUG}&hostId=${hostStaff.id}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(reception.page.getByText(/Salão/i)).toBeVisible();

    await openCustomerViaQr(customerA.page, 'QRTEST91');
    await fillWelcome(customerA.page, 'Noite Host Mesa 91', freshCpf());
    await expect(customerA.page.getByTestId('waiting-approval')).toBeVisible();

    await expect(reception.page.getByText(/Verificar mesa escaneada/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(reception.page.getByText(/Mesa 91 · Noite Host Mesa 91/i)).toBeVisible();
    await reception.page.getByText(/Mesa 91 · Noite Host Mesa 91/i).click();
    const firstRequest = await waitFor(
      () => latestScanRequest('QRTEST91'),
      (request) => !!request && request.status === 'pending',
      15_000,
    );
    await expect(reception.page).toHaveURL(
      new RegExp(`/host/scan-verification/${firstRequest!.id}`),
    );
    const approve = reception.page.getByRole('button', { name: /Aprovar entrada/i });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(customerA.page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
      timeout: 20_000,
    });

    const session91 = activeSessions('QRTEST91')[0];
    expect(session91?.id).toBeTruthy();
    const hostParticipant = participantsForSession(session91.id).find(
      (participant) => participant.customer_name === 'Noite Host Mesa 91',
    );
    expect(hostParticipant?.status).toBe('approved');
    expect(hostParticipant?.host_customer_id).toBe(hostParticipant?.customer_id);

    await openCustomerViaQr(customerB.page, 'QRTEST91');
    await fillWelcome(customerB.page, 'Noite Convidado Mesa 91', freshCpf());
    await expect(customerB.page.getByTestId('waiting-approval')).toBeVisible();
    await expect(customerA.page.getByTestId('host-join-request-banner')).toBeVisible({
      timeout: 20_000,
    });
    await customerA.page.getByRole('button', { name: /Aprovar Noite Convidado Mesa 91/i }).click();
    await expect(customerB.page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
      timeout: 20_000,
    });
    expect(scanRequests('QRTEST91').filter((request) => request.status === 'pending')).toHaveLength(0);

    await reception.page.goto(
      `${STAFF_BASE_URL}/host?tenant=${DEFAULT_SLUG}&hostId=${hostStaff.id}`,
      { waitUntil: 'domcontentloaded' },
    );
    await openCustomerViaQr(customerC.page, 'QRTEST92');
    await fillWelcome(customerC.page, 'Noite Host Mesa 92', freshCpf());
    await expect(customerC.page.getByTestId('waiting-approval')).toBeVisible();
    await expect(reception.page.getByText(/Mesa 92 · Noite Host Mesa 92/i)).toBeVisible({
      timeout: 20_000,
    });
    await reception.page.getByText(/Mesa 92 · Noite Host Mesa 92/i).click();
    const secondRequest = await waitFor(
      () => latestScanRequest('QRTEST92'),
      (request) => !!request && request.status === 'pending',
      15_000,
    );
    await expect(reception.page).toHaveURL(
      new RegExp(`/host/scan-verification/${secondRequest!.id}`),
    );
    const approve92 = reception.page.getByRole('button', { name: /Aprovar entrada/i });
    await expect(approve92).toBeEnabled();
    await approve92.click();
    await expect(customerC.page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
      timeout: 20_000,
    });

    const session92 = activeSessions('QRTEST92')[0];
    expect(session92?.id).toBeTruthy();
    const [order91, order92] = await Promise.all([
      createAndConfirmOrder({
        sessionId: session91.id,
        item: menuItems[0],
        quantity: 2,
        notes: 'noite e2e mesa 91',
      }),
      createAndConfirmOrder({
        sessionId: session92.id,
        item: menuItems[1],
        quantity: 1,
        notes: 'noite e2e mesa 92',
      }),
    ]);

    await kitchen.page.goto(`${STAFF_BASE_URL}/cozinha`, { waitUntil: 'domcontentloaded' });
    await expect(kitchen.page.getByRole('heading', { name: /Cozinha.*KDS/i })).toBeVisible();
    await expect
      .poll(() => kitchen.page.getByText(menuItems[0].name).count(), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(await kitchen.page.getByText(menuItems[1].name).count()).toBeGreaterThan(0);

    await updateOrderStatus(order91.id, 'in_progress');
    await updateOrderStatus(order92.id, 'in_progress');
    await kitchen.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(kitchen.page.getByText(/PREPARANDO/i)).toBeVisible({ timeout: 20_000 });

    const calls = await Promise.all([
      createWaiterCall(session91.id, 'serve_drink'),
      createWaiterCall(session91.id, 'ask_bill'),
      createWaiterCall(session92.id, 'other'),
    ]);
    expect(calls.map((call) => call.status)).toEqual(['pending', 'pending', 'pending']);
    const uniqueCalls = [...new Map(calls.map((call) => [call.id, call])).values()];

    await waiter.page.goto(
      `${STAFF_BASE_URL}/waiter?tenant=${DEFAULT_SLUG}&waiterId=${waiterStaff.id}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(waiter.page.getByText(/Minhas mesas/i)).toBeVisible();
    await expect
      .poll(() => waiter.page.getByText(/chamou/i).count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const pendingCalls = await staffFetch<Array<{ id: string; status: string }>>(
      `/${DEFAULT_SLUG}/waiter-calls/pending`,
      { method: 'GET', staff: waiterStaff },
    );
    expect(pendingCalls.status).toBe(200);
    expect(pendingCalls.body.length).toBeGreaterThanOrEqual(uniqueCalls.length);
    for (const call of uniqueCalls) {
      const response = await staffFetch(`/${DEFAULT_SLUG}/waiter-calls/${call.id}/acknowledge`, {
        method: 'POST',
        staff: waiterStaff,
        body: JSON.stringify({ etaMinutes: 3 }),
      });
      expect(
        [200, 201],
        `acknowledge waiter call ${call.id} failed: ${response.status} ${JSON.stringify(response.body)}`,
      ).toContain(response.status);
    }

    await updateOrderStatus(order91.id, 'ready');
    await updateOrderStatus(order91.id, 'delivered');
    await updateOrderStatus(order92.id, 'ready');

    await manager.page.goto(
      `${STAFF_BASE_URL}/manager/operacoes/mesas-ativas?slug=${DEFAULT_SLUG}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(manager.page.getByRole('heading', { name: 'Mesas ativas' })).toBeVisible({
      timeout: 20_000,
    });

    await tableHistory.page.goto(
      `${STAFF_BASE_URL}/manager/mesa/91?slug=${DEFAULT_SLUG}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(tableHistory.page.getByText(/Mesa 91/i)).toBeVisible({
      timeout: 20_000,
    });

    const orderRows = psqlJson<{ id: string; status: string; table_code: string }>(
      `SELECT o.id, o.status, t.code AS table_code
         FROM restaurant_dev.orders o
         JOIN restaurant_dev.table_sessions ts ON ts.id = o.table_session_id
         JOIN restaurant_dev.tables t ON t.id = ts.table_id
        WHERE o.id IN (${[order91.id, order92.id].map((id) => `'${id}'`).join(',')})
        ORDER BY t.code`,
    );
    expect(orderRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: order91.id, status: 'delivered', table_code: 'QRTEST91' }),
        expect.objectContaining({ id: order92.id, status: 'ready', table_code: 'QRTEST92' }),
      ]),
    );
  } finally {
    await closeRuntimePages(opened);
  }
});
