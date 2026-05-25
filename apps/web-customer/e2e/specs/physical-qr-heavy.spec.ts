import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  API_BASE_URL,
  DEFAULT_SLUG,
  OTHER_SLUG,
  STAFF_BASE_URL,
  activeSessions,
  approveScanRequest,
  chainForRequest,
  connectStaffSocket,
  ensureOtherTenant,
  fillWelcome,
  forceCurrentEscalationStepExpired,
  forceReleaseExpired,
  grantLocation,
  initSession,
  latestScanRequest,
  makeDailyAccessToken,
  makeHmac,
  mongoEval,
  mongoFind,
  mongoIndexNames,
  nextCpf,
  openCustomerViaQr,
  participantsForSession,
  preReleaseTable,
  psqlJson,
  rejectScanRequest,
  releases,
  resetQrTables,
  resolveQr,
  scanAndWelcome,
  scanRequests,
  staffByRole,
  staffFetch,
  waitFor,
} from '../helpers/physical-qr';
import { QR_TEST_TABLES } from '../helpers/qr';

test.describe.configure({ mode: 'serial' });
test.setTimeout(130_000);

let cpfSeed = Math.floor(Date.now() % 100_000);
let ipSeed = Math.floor(Date.now() % 60_000);

function freshCpf(): string {
  cpfSeed += 1;
  return nextCpf(cpfSeed);
}

function nextBrowserIp(): string {
  ipSeed += 1;
  const normalized = Math.abs(ipSeed) % 65_536;
  return `198.19.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

async function prepareBrowser(page: import('@playwright/test').Page): Promise<void> {
  await page.context().clearCookies();
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': nextBrowserIp(),
  });
  await grantLocation(page);
}

async function routeStaffApiToLocalhost(
  page: import('@playwright/test').Page,
): Promise<void> {
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

test.beforeEach(async ({ page }) => {
  await prepareBrowser(page);
});

test('E2E 1 + 13 + 14: bloqueia fluxo antigo, token cruzado e links vencidos', async ({
  page,
}) => {
  resetQrTables();

  const qr91 = await resolveQr('QRTEST91');
  const qr92 = await resolveQr('QRTEST92');

  const missing = await initSession(qr91, { accessToken: null });
  expect(missing.status).toBe(401);

  const empty = await initSession(qr91, { accessToken: '' });
  expect(empty.status).toBe(401);

  const crossed = await initSession(qr91, { accessToken: qr92.accessToken });
  expect(crossed.status).toBe(401);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expiredToken = await initSession(qr91, {
    accessToken: makeDailyAccessToken('QRTEST91', yesterday),
  });
  expect(expiredToken.status).toBe(401);

  const oldTs = String(Date.now() - 31 * 60 * 1000);
  const expiredHmac = await initSession(qr91, {
    timestamp: oldTs,
    hmacSignature: makeHmac('QRTEST91', oldTs),
  });
  expect(expiredHmac.status).toBe(401);

  const valid = await initSession(qr91);
  expect(valid.status).toBe(201);
  expect(valid.body.sessionId).toBeTruthy();
  expect(activeSessions('QRTEST91')).toHaveLength(1);

  const participants = psqlJson<{ count: number }>(
    `SELECT count(*)::int
       FROM restaurant_dev.session_participants sp
       JOIN restaurant_dev.table_sessions ts ON ts.id = sp.table_session_id
       JOIN restaurant_dev.tables t ON t.id = ts.table_id
      WHERE t.code = 'QRTEST91'
        AND ts.status = 'active'`,
  )[0];
  expect(participants.count).toBe(0);

  const events = mongoFind<{ eventType: string }>(
    'qr_scan_events',
    {
      tenantId: DEFAULT_SLUG,
      tableCode: 'QRTEST91',
      eventType: {
        $in: [
          'qr_access_token_missing',
          'qr_access_token_invalid',
          'qr_access_token_expired',
          'qr_hmac_invalid_or_expired',
        ],
      },
    },
    20,
  ).map((e) => e.eventType);
  expect(events).toEqual(expect.arrayContaining([
    'qr_access_token_missing',
    'qr_access_token_invalid',
    'qr_access_token_expired',
    'qr_hmac_invalid_or_expired',
  ]));

  const staleUrl = new URL(qr91.redirectUrl);
  staleUrl.searchParams.delete('accessToken');
  await page.goto(staleUrl.toString(), { waitUntil: 'networkidle' });
  await expect(page.getByText(/Escaneie novamente.*QR.*fisico|codigo fisico/i)).toBeVisible({
    timeout: 30_000,
  });
});

test('E2E 2: primeiro scan sem pre-liberacao cria verificacao fisica', async ({
  page,
}) => {
  resetQrTables(['QRTEST91']);

  await openCustomerViaQr(page, 'QRTEST91');
  await expect(page.getByTestId('welcome-modal')).toBeVisible({ timeout: 30_000 });
  await fillWelcome(page, 'Cliente A E2E', freshCpf());

  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Ver cardápio|Ver cardapio/i })).toHaveCount(0);

  const sessions = activeSessions('QRTEST91');
  expect(sessions).toHaveLength(1);
  const participants = participantsForSession(sessions[0].id);
  expect(participants).toHaveLength(1);
  expect(participants[0].status).toBe('pending');
  expect(participants[0].host_customer_id).toBeNull();

  const request = latestScanRequest('QRTEST91');
  expect(request?.status).toBe('pending');
  expect(request?.location_status).toBe('granted');
  const chain = chainForRequest(request!.id);
  expect(chain?.kind).toBe('scan_verification');
  expect(chain?.level).toBe(0);

  const staffList = await staffFetch<Array<{ id: string; status: string }>>(
    `/${DEFAULT_SLUG}/scan-verification-requests?status=pending`,
    { method: 'GET' },
  );
  expect(staffList.status).toBe(200);
  expect(staffList.body.some((r) => r.id === request!.id)).toBe(true);

  const mongoEvents = mongoFind<{ eventType: string }>(
    'scan_verification_events',
    { tenantId: DEFAULT_SLUG, eventType: 'scan_verification_created' },
    10,
  );
  expect(mongoEvents.length).toBeGreaterThan(0);
});

test('E2E 3: aprovacao fisica libera cliente, define host e sobrevive reload', async ({
  page,
}) => {
  resetQrTables(['QRTEST91']);

  await openCustomerViaQr(page, 'QRTEST91');
  await fillWelcome(page, 'Cliente A Aprovado', freshCpf());
  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });

  const request = await waitFor(
    () => latestScanRequest('QRTEST91'),
    (r) => !!r && r.status === 'pending',
  );
  const decision = await approveScanRequest(request!.id);
  expect([200, 201]).toContain(decision.status);

  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 15_000,
  });

  const approved = latestScanRequest('QRTEST91');
  expect(approved?.status).toBe('approved');
  const participant = participantsForSession(request!.table_session_id)[0];
  expect(participant.status).toBe('approved');
  expect(participant.host_customer_id).toBe(participant.customer_id);
  expect(chainForRequest(request!.id)?.completed_at).toBeTruthy();

  const mongoEvents = mongoFind<{ eventType: string }>(
    'scan_verification_events',
    { tenantId: DEFAULT_SLUG, eventType: 'scan_verification_approved' },
    10,
  );
  expect(mongoEvents.length).toBeGreaterThan(0);
});

test('E2E 4: rejeicao fisica bloqueia cliente e audita motivo', async ({ page }) => {
  resetQrTables(['QRTEST92']);

  await openCustomerViaQr(page, 'QRTEST92');
  await fillWelcome(page, 'Cliente B Rejeitado', freshCpf());
  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });

  const request = await waitFor(
    () => latestScanRequest('QRTEST92'),
    (r) => !!r && r.status === 'pending',
  );
  const decision = await rejectScanRequest(request!.id, 'mesa vazia');
  expect([200, 201]).toContain(decision.status);

  await expect(page.getByText(/não autorizou|nao autorizou|não autorizada|nao autorizada|recusada/i)).toBeVisible({
    timeout: 15_000,
  });

  const rejected = latestScanRequest('QRTEST92');
  expect(rejected?.status).toBe('rejected');
  expect(rejected?.rejection_reason).toContain('mesa vazia');
  const participant = participantsForSession(request!.table_session_id)[0];
  expect(participant.status).toBe('rejected');
  expect(participant.host_customer_id).toBeNull();

  const auditEvents = mongoFind<{ eventType: string; metadata?: { reason?: string } }>(
    'security_audit_events',
    { tenantId: DEFAULT_SLUG, eventType: 'scan_verification_rejected' },
    10,
  );
  expect(auditEvents.some((e) => e.metadata?.reason === 'mesa vazia')).toBe(true);
});

test('E2E 5 + 6: pre-liberacao consumivel entra direto; expirada cai em verificacao', async ({
  page,
}) => {
  resetQrTables(['QRTEST91', 'QRTEST92']);

  await preReleaseTable('QRTEST91');
  await openCustomerViaQr(page, 'QRTEST91');
  await fillWelcome(page, 'Cliente C Liberado', freshCpf());
  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 15_000,
  });

  const release = releases('QRTEST91')[0];
  expect(release.consumed_at).toBeTruthy();
  expect(release.consumed_by_session_id).toBeTruthy();
  expect(release.consumed_by_customer_id).toBeTruthy();
  expect(scanRequests('QRTEST91')).toHaveLength(0);
  const session = activeSessions('QRTEST91')[0];
  const participant = participantsForSession(session.id)[0];
  expect(participant.status).toBe('approved');
  expect(participant.host_customer_id).toBe(participant.customer_id);

  await page.context().clearCookies();
  await preReleaseTable('QRTEST92');
  forceReleaseExpired('QRTEST92');
  const direct = await scanAndWelcome({
    tableCode: 'QRTEST92',
    name: 'Cliente D Expirado',
    cpf: freshCpf(),
  });
  const expiredRelease = releases('QRTEST92')[0];
  expect(expiredRelease.consumed_at).toBeNull();
  expect(participantsForSession(direct.session.sessionId)[0].status).toBe('pending');
  expect(latestScanRequest('QRTEST92')?.status).toBe('pending');
});

test('E2E 7 + 8: segundo cliente aguarda host, nao staff; host aprova ou rejeita', async ({
  browser,
}) => {
  resetQrTables(['QRTEST91']);

  const hostContext = await browser.newContext({
    geolocation: { latitude: -23.56, longitude: -46.64 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': nextBrowserIp() },
  });
  const joinContext = await browser.newContext({
    geolocation: { latitude: -23.56, longitude: -46.64 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': nextBrowserIp() },
  });
  const rejectContext = await browser.newContext({
    geolocation: { latitude: -23.56, longitude: -46.64 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': nextBrowserIp() },
  });
  try {
    await preReleaseTable('QRTEST91');
    const hostPage = await hostContext.newPage();
    await openCustomerViaQr(hostPage, 'QRTEST91');
    await fillWelcome(hostPage, 'Host A Mesa', freshCpf());
    await expect(hostPage.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
      timeout: 20_000,
    });

    const joinPage = await joinContext.newPage();
    await openCustomerViaQr(joinPage, 'QRTEST91');
    await fillWelcome(joinPage, 'Cliente E Join', freshCpf());
    await expect(joinPage.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });
    expect(scanRequests('QRTEST91')).toHaveLength(0);

    await expect(hostPage.getByTestId('host-join-request-banner')).toBeVisible({
      timeout: 15_000,
    });
    await hostPage.getByRole('button', { name: /Aprovar Cliente E Join/i }).click();
    await expect(joinPage.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
      timeout: 15_000,
    });

    const session = activeSessions('QRTEST91')[0];
    const approvedParticipants = participantsForSession(session.id);
    const host = approvedParticipants.find((p) => p.customer_name === 'Host A Mesa');
    const joined = approvedParticipants.find((p) => p.customer_name === 'Cliente E Join');
    expect(host?.host_customer_id).toBe(host?.customer_id);
    expect(joined?.status).toBe('approved');

    const rejectPage = await rejectContext.newPage();
    await openCustomerViaQr(rejectPage, 'QRTEST91');
    await fillWelcome(rejectPage, 'Cliente F Reject', freshCpf());
    await expect(rejectPage.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });
    await expect(hostPage.getByRole('button', { name: /Rejeitar Cliente F Reject/i })).toBeVisible({
      timeout: 15_000,
    });
    await hostPage.getByRole('button', { name: /Rejeitar Cliente F Reject/i }).click();
    await expect(rejectPage.getByText(/não autorizou|nao autorizou|não autorizada|nao autorizada/i)).toBeVisible({
      timeout: 15_000,
    });
    expect(scanRequests('QRTEST91')).toHaveLength(0);
    const rejected = participantsForSession(session.id).find(
      (p) => p.customer_name === 'Cliente F Reject',
    );
    expect(rejected?.status).toBe('rejected');
  } finally {
    await hostContext.close();
    await joinContext.close();
    await rejectContext.close();
  }
});

test('E2E 9: cascade staff completo sem resposta termina em timeout', async () => {
  resetQrTables(['QRTEST92']);
  const manager = await staffByRole('manager');
  const waiter = await staffByRole('waiter');
  const hostSocket = await connectStaffSocket({
    staff: manager,
    role: 'host',
    events: ['scan_verification.created', 'scan_verification.escalated', 'scan_verification.resolved'],
  });
  const managerSocket = await connectStaffSocket({
    staff: manager,
    role: 'manager',
    events: ['scan_verification.created', 'scan_verification.escalated', 'scan_verification.resolved'],
  });
  const waiterSocket = await connectStaffSocket({
    staff: waiter,
    role: 'waiter',
    events: ['scan_verification.created', 'scan_verification.escalated', 'scan_verification.resolved'],
  });

  try {
    const flow = await scanAndWelcome({
      tableCode: 'QRTEST92',
      name: 'Cliente G Cascade',
      cpf: freshCpf(),
    });
    const request = await waitFor(
      () => latestScanRequest('QRTEST92'),
      (r) => !!r && r.customer_id === flow.welcome.customerId,
    );
    await waitFor(
      () => hostSocket.seen,
      (events) => events.some((e) => e.event === 'scan_verification.created'),
      10_000,
    );

    forceCurrentEscalationStepExpired(request!.id);
    await waitFor(
      () => chainForRequest(request!.id),
      (chain) => chain?.level === 1 && chain.current_assignee_role === 'manager',
      20_000,
    );
    forceCurrentEscalationStepExpired(request!.id);
    await waitFor(
      () => chainForRequest(request!.id),
      (chain) => chain?.level === 2 && chain.current_assignee_role === 'waiter',
      20_000,
    );
    forceCurrentEscalationStepExpired(request!.id);
    await waitFor(
      () => latestScanRequest('QRTEST92'),
      (r) => r?.status === 'expired',
      25_000,
    );

    const finalRequest = latestScanRequest('QRTEST92')!;
    const participant = participantsForSession(finalRequest.table_session_id).find(
      (p) => p.customer_id === finalRequest.customer_id,
    );
    expect(participant?.status).toBe('rejected');
    expect(chainForRequest(request!.id)?.completed_at).toBeTruthy();
    expect(managerSocket.seen.some((e) => e.event === 'scan_verification.escalated')).toBe(true);
    expect(waiterSocket.seen.some((e) => e.event === 'scan_verification.resolved')).toBe(true);

    const mongoEvents = mongoFind<{ eventType: string }>(
      'scan_verification_events',
      { tenantId: DEFAULT_SLUG, 'metadata.requestId': request!.id },
      20,
    ).map((e) => e.eventType);
    expect(mongoEvents).toEqual(expect.arrayContaining([
      'scan_verification_created',
      'scan_verification_escalated',
      'scan_verification_timeout',
    ]));
  } finally {
    hostSocket.socket.disconnect();
    managerSocket.socket.disconnect();
    waiterSocket.socket.disconnect();
  }
});

test('E2E 10: staff aprova apos escalonamento e registra manager', async () => {
  resetQrTables(['QRTEST91']);
  const manager = await staffByRole('manager');
  const flow = await scanAndWelcome({
    tableCode: 'QRTEST91',
    name: 'Cliente Manager Approve',
    cpf: freshCpf(),
  });
  const request = latestScanRequest('QRTEST91')!;
  expect(request.customer_id).toBe(flow.welcome.customerId);

  forceCurrentEscalationStepExpired(request.id);
  await waitFor(
    () => chainForRequest(request.id),
    (chain) => chain?.level === 1 && chain.current_assignee_role === 'manager',
    20_000,
  );
  const decision = await approveScanRequest(request.id, manager);
  expect([200, 201]).toContain(decision.status);

  await waitFor(
    () => latestScanRequest('QRTEST91'),
    (r) => r?.status === 'approved',
    10_000,
  );
  const approved = latestScanRequest('QRTEST91')!;
  expect(approved.approved_by_staff_id).toBe(manager.id);
  expect(participantsForSession(approved.table_session_id)[0].status).toBe('approved');
  expect(chainForRequest(request.id)?.completed_at).toBeTruthy();
});

test('E2E 11: concorrencia de primeiro scan mantem uma sessao ativa e cores coerentes', async () => {
  resetQrTables(['QRTEST91']);

  const [h, i] = await Promise.all([
    scanAndWelcome({ tableCode: 'QRTEST91', name: 'Cliente H Race', cpf: freshCpf() }),
    scanAndWelcome({ tableCode: 'QRTEST91', name: 'Cliente I Race', cpf: freshCpf() }),
  ]);

  expect(h.session.sessionId).toBe(i.session.sessionId);
  const sessions = activeSessions('QRTEST91');
  expect(sessions).toHaveLength(1);
  const participants = participantsForSession(sessions[0].id);
  expect(participants).toHaveLength(2);
  expect(participants.every((p) => p.status === 'pending')).toBe(true);
  expect(new Set(participants.map((p) => p.color_index)).size).toBe(participants.length);
  expect(scanRequests('QRTEST91').length).toBeGreaterThanOrEqual(1);

  const requestToApprove = scanRequests('QRTEST91').find(
    (r) => r.customer_id === h.welcome.customerId,
  );
  expect(requestToApprove).toBeTruthy();
  await approveScanRequest(requestToApprove!.id);
  await waitFor(
    () => participantsForSession(sessions[0].id),
    (rows) => rows.some((p) => p.customer_id === h.welcome.customerId && p.status === 'approved'),
    10_000,
  );
  const after = participantsForSession(sessions[0].id);
  expect(after.find((p) => p.customer_id === h.welcome.customerId)?.host_customer_id).toBe(
    h.welcome.customerId,
  );
  expect(after.find((p) => p.customer_id === i.welcome.customerId)?.status).toBe('pending');
});

test('E2E 12: concorrencia aprovacao/rejeicao staff tem primeira decisao vencedora', async () => {
  resetQrTables(['QRTEST92']);
  await scanAndWelcome({ tableCode: 'QRTEST92', name: 'Cliente Staff Race', cpf: freshCpf() });
  const request = latestScanRequest('QRTEST92')!;

  const [a, b] = await Promise.all([
    approveScanRequest(request.id),
    rejectScanRequest(request.id, 'decisao tardia'),
  ]);
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([201, 409]);

  const finalRequest = latestScanRequest('QRTEST92')!;
  expect(['approved', 'rejected']).toContain(finalRequest.status);
  const terminalEvents = mongoFind<{ eventType: string }>(
    'scan_verification_events',
    { tenantId: DEFAULT_SLUG, 'metadata.requestId': request.id },
    20,
  )
    .map((e) => e.eventType)
    .filter((t) => t === 'scan_verification_approved' || t === 'scan_verification_rejected');
  expect(new Set(terminalEvents).size).toBeLessThanOrEqual(1);
});

test('E2E 15: Mongo fora do ar nao bloqueia operacao Postgres', async () => {
  test.skip(
    process.env.E2E_STOP_MONGO !== '1',
    'Opt-in: defina E2E_STOP_MONGO=1 para parar/reiniciar o container Mongo durante a suite.',
  );
  resetQrTables(['QRTEST91']);
  execDocker(['stop', 'restaurant-mongodb']);
  try {
    const flow = await scanAndWelcome({
      tableCode: 'QRTEST91',
      name: 'Cliente Sem Mongo',
      cpf: freshCpf(),
    });
    const request = latestScanRequest('QRTEST91')!;
    const decision = await approveScanRequest(request.id);
    expect([200, 201]).toContain(decision.status);
    const participant = participantsForSession(flow.session.sessionId).find(
      (p) => p.customer_id === flow.welcome.customerId,
    );
    expect(participant?.status).toBe('approved');
  } finally {
    execDocker(['start', 'restaurant-mongodb']);
    await waitFor(
      () => {
        try {
          return mongoEval("db.adminCommand({ ping: 1 }).ok");
        } catch {
          return '0';
        }
      },
      (ok) => ok === '1',
      30_000,
      1_000,
    );
  }
});

test('E2E 16: reload e reconexao WS durante espera recebem decisao', async ({ page }) => {
  resetQrTables(['QRTEST91']);
  await openCustomerViaQr(page, 'QRTEST91');
  await fillWelcome(page, 'Cliente Reload WS', freshCpf());
  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 15_000 });

  const request = latestScanRequest('QRTEST91')!;
  await approveScanRequest(request.id);
  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 15_000,
  });
});

test('E2E 17: isolamento multi-tenant em QR, session/init e request lookup', async () => {
  resetQrTables(['QRTEST91']);
  ensureOtherTenant();

  const qrA = await resolveQr('QRTEST91');
  const responseB = await fetch(`${API_BASE_URL}/qr/qrtestb1-public-token-fixed`, {
    redirect: 'manual',
  });
  expect(responseB.status).toBe(302);
  const urlB = new URL(responseB.headers.get('location')!);
  expect(urlB.pathname).toContain(`/${OTHER_SLUG}/mesa/QRTESTB1`);

  const badInit = await initSession(
    {
      redirectUrl: urlB.toString(),
      slug: OTHER_SLUG,
      tableCode: 'QRTESTB1',
      hmac: urlB.searchParams.get('hmac') ?? '',
      ts: urlB.searchParams.get('ts') ?? '',
      accessToken: urlB.searchParams.get('accessToken') ?? '',
    },
    { accessToken: qrA.accessToken },
  );
  expect(badInit.status).toBe(401);

  await scanAndWelcome({ tableCode: 'QRTEST91', name: 'Cliente Tenant A', cpf: freshCpf() });
  const requestA = latestScanRequest('QRTEST91')!;
  const lookupB = await staffFetch(`/${OTHER_SLUG}/scan-verification-requests/${requestA.id}`, {
    method: 'GET',
  });
  expect(lookupB.status).toBe(404);
});

test('E2E 18: auditoria mensal por tenant tem indices e campos essenciais', async () => {
  resetQrTables(['QRTEST92']);
  await scanAndWelcome({ tableCode: 'QRTEST92', name: 'Cliente Audit', cpf: freshCpf() });
  const request = latestScanRequest('QRTEST92')!;
  await rejectScanRequest(request.id, 'auditoria mensal');

  const indexNames = mongoIndexNames('scan_verification_events');
  expect(indexNames).toEqual(expect.arrayContaining([
    'tenantId_createdAt',
    'tenantId_tableId_createdAt',
    'tenantId_customerId_createdAt',
    'eventType_createdAt',
  ]));

  const events = mongoFind<{
    tenantId?: string;
    tableId?: string;
    tableSessionId?: string;
    customerId?: string;
    eventType?: string;
  }>(
    'scan_verification_events',
    { tenantId: DEFAULT_SLUG, 'metadata.requestId': request.id },
    10,
  );
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) {
    expect(event.tenantId).toBe(DEFAULT_SLUG);
    expect(event.tableId).toBeTruthy();
    expect(event.tableSessionId).toBeTruthy();
    expect(event.customerId).toBeTruthy();
    expect(event.eventType).toBeTruthy();
  }
});

test('E2E 19: QR fixo reutilizado apos sessao encerrada cria nova sessao sem herdar host', async () => {
  resetQrTables(['QRTEST91']);
  const first = await scanAndWelcome({
    tableCode: 'QRTEST91',
    name: 'Cliente Host Antigo',
    cpf: freshCpf(),
    preRelease: true,
  });
  const firstParticipant = participantsForSession(first.session.sessionId)[0];
  expect(firstParticipant.host_customer_id).toBe(first.welcome.customerId);

  await preReleaseTable('QRTEST91');
  const second = await scanAndWelcome({
    tableCode: 'QRTEST91',
    name: 'Cliente Host Novo',
    cpf: freshCpf(),
  });

  expect(second.session.sessionId).not.toBe(first.session.sessionId);
  const secondParticipant = participantsForSession(second.session.sessionId)[0];
  expect(secondParticipant.host_customer_id).toBe(second.welcome.customerId);
  expect(secondParticipant.host_customer_id).not.toBe(first.welcome.customerId);
});

test('E2E 20: staff UI mostra pendencia fisica, detalhe e remove apos decisao', async ({
  page,
}) => {
  resetQrTables(['QRTEST91', 'QRTEST92']);
  const manager = await staffByRole('manager');
  await scanAndWelcome({ tableCode: 'QRTEST91', name: 'Cliente Staff UI', cpf: freshCpf() });
  const request = latestScanRequest('QRTEST91')!;

  await page.addInitScript(
    ({ staffId, role }) => {
      window.localStorage.setItem('staffId', staffId);
      window.localStorage.setItem('staffRole', role);
    },
    { staffId: manager.id, role: manager.role },
  );
  await routeStaffApiToLocalhost(page);
  await page.goto(`${STAFF_BASE_URL}/host?tenant=${DEFAULT_SLUG}&hostId=${manager.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByText(/Verificar mesa escaneada/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Mesa 91 · Cliente Staff UI/i)).toBeVisible();
  await expect(page.getByText(/CPF \*\*\*\.\*\*\*\.\*\*\*-/i)).toBeVisible();
  await page.getByText(/Mesa 91 · Cliente Staff UI/i).click();

  await expect(page).toHaveURL(new RegExp(`/host/scan-verification/${request.id}`));
  await expect(page.getByText(/Verificar QR/i)).toBeVisible();
  await expect(page.getByText('Mesa 91', { exact: true })).toBeVisible();
  await expect(page.getByText(/localizacao|localização/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Rejeitar/i })).toBeEnabled();
  const approve = page.getByRole('button', { name: /Aprovar entrada/i });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page).toHaveURL(new RegExp(`/host\\?tenant=${DEFAULT_SLUG}`), {
    timeout: 15_000,
  });
  await expect(page.getByText(/Verificar mesa escaneada/i)).toBeHidden({ timeout: 15_000 });

  await scanAndWelcome({ tableCode: 'QRTEST92', name: 'Cliente Staff UI Reject', cpf: freshCpf() });
  const rejectRequest = latestScanRequest('QRTEST92')!;
  const rejectPage = await page.context().newPage();
  try {
    await rejectPage.addInitScript(
      ({ staffId, role }) => {
        window.localStorage.setItem('staffId', staffId);
        window.localStorage.setItem('staffRole', role);
      },
      { staffId: manager.id, role: manager.role },
    );
    await routeStaffApiToLocalhost(rejectPage);
    await rejectPage.goto(
      `${STAFF_BASE_URL}/host/scan-verification/${rejectRequest.id}?tenant=${DEFAULT_SLUG}&hostId=${manager.id}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(rejectPage.getByText('Mesa 92', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(rejectPage.getByText(/Cliente Staff UI Reject/i)).toBeVisible();
    const reject = rejectPage.getByRole('button', { name: /Rejeitar/i });
    await expect(reject).toBeEnabled();
    const rejectResponsePromise = rejectPage.waitForResponse(
      (response) =>
        response.url().includes(`/scan-verification-requests/${rejectRequest.id}/reject`),
      { timeout: 10_000 },
    );
    await reject.dispatchEvent('click');
    const rejectResponse = await rejectResponsePromise;
    expect([200, 201]).toContain(rejectResponse.status());
    await waitFor(
      () => scanRequests('QRTEST92').find((r) => r.id === rejectRequest.id)?.status,
      (status) => status === 'rejected',
      10_000,
    );
  } finally {
    await rejectPage.close();
  }
});

function execDocker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
  }).trim();
}
