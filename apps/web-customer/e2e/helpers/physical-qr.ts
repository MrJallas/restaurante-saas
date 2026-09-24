import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { QR_TEST_TABLES, type TableCode } from './qr';

export const DEFAULT_SLUG = 'restaurant_dev';
export const OTHER_SLUG = 'restaurant_e2e_other';
export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api';
export const CUSTOMER_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3003';
export const STAFF_BASE_URL = process.env.E2E_STAFF_BASE_URL ?? 'http://localhost:3002';
export { STAFF_API_KEY } from './staff-key';

const QR_SECRETS: Record<TableCode, string> = {
  QRTEST91: 'qrtest91-secret-fixed',
  QRTEST92: 'qrtest92-secret-fixed',
};
let welcomeIpCounter = Math.floor(Date.now() % 60_000);

function syntheticIp(seed: number, secondOctet = 18): string {
  const normalized = Math.abs(seed) % 65_536;
  return `198.${secondOctet}.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

export interface ResolvedQr {
  redirectUrl: string;
  slug: string;
  tableCode: TableCode | string;
  hmac: string;
  ts: string;
  accessToken: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface SessionInitResult {
  status: number;
  body: {
    sessionId?: string;
    /** Segredo opaco de autenticação; nunca confundir com o UUID sessionId. */
    token?: string;
    tableCode?: string;
    tableLabel?: string;
    message?: string;
  };
  setCookie: string | null;
}

export interface WelcomeResult {
  status: number;
  body: {
    customerId?: string;
    name?: string;
    visitId?: string;
    message?: string;
  };
  recognitionCookie: string | null;
}

export interface StaffRow {
  id: string;
  name: string;
  role: string;
  cpf: string;
}

export interface ScanRequestRow {
  id: string;
  table_session_id: string;
  table_id: string;
  table_code: string;
  customer_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  location_status: string;
  escalation_level: number;
  escalation_chain_id: string | null;
  ttl_expires_at: string;
  decided_at: string | null;
  rejection_reason: string | null;
  approved_by_staff_id: string | null;
  rejected_by_staff_id: string | null;
}

export interface ParticipantRow {
  table_session_id: string;
  customer_id: string;
  status: 'pending' | 'approved' | 'rejected';
  color_index: number;
  host_customer_id: string | null;
  customer_name: string;
}

export interface ReleaseRow {
  id: string;
  table_id: string;
  consumed_at: string | null;
  consumed_by_session_id: string | null;
  consumed_by_customer_id: string | null;
  expires_at: string;
}

export interface ChainRow {
  id: string;
  kind: string;
  source_id: string;
  level: number;
  current_assignee_role: string | null;
  ttl_expires_at: string | null;
  completed_at: string | null;
  resolution_notes: string | null;
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'restaurant-postgres',
      'psql',
      '-U',
      'postgres',
      '-p',
      '5434',
      '-d',
      'restaurant_saas',
      '-tA',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

export function psqlJson<T>(selectSql: string): T[] {
  const out = psql(
    `SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)::text FROM (${selectSql}) q;`,
  );
  return JSON.parse(out || '[]') as T[];
}

export function mongoEval(script: string): string {
  return execFileSync(
    'docker',
    ['exec', 'restaurant-mongodb', 'mongosh', '--quiet', '--eval', script],
    { encoding: 'utf8' },
  ).trim();
}

export function mongoFind<T>(
  collection: 'qr_scan_events' | 'scan_verification_events' | 'security_audit_events',
  filter: Record<string, unknown>,
  limit = 20,
): T[] {
  const script = `
    const docs = db.getSiblingDB('restaurant_security')
      .getCollection(${JSON.stringify(collection)})
      .find(${JSON.stringify(filter)})
      .sort({ createdAt: -1 })
      .limit(${limit})
      .map((doc) => ({
        ...doc,
        _id: String(doc._id),
        createdAt: doc.createdAt && doc.createdAt.toISOString ? doc.createdAt.toISOString() : doc.createdAt,
        expiresAt: doc.expiresAt && doc.expiresAt.toISOString ? doc.expiresAt.toISOString() : doc.expiresAt,
      }))
      .toArray();
    print(JSON.stringify(docs));
  `;
  const out = mongoEval(script);
  return JSON.parse(out || '[]') as T[];
}

export function mongoIndexNames(
  collection: 'qr_scan_events' | 'scan_verification_events' | 'security_audit_events',
): string[] {
  const script = `
    const names = db.getSiblingDB('restaurant_security')
      .getCollection(${JSON.stringify(collection)})
      .getIndexes()
      .map((idx) => idx.name);
    print(JSON.stringify(names));
  `;
  return JSON.parse(mongoEval(script) || '[]') as string[];
}

export function ensureQrFixtures(slug = DEFAULT_SLUG): void {
  const schema = slug === DEFAULT_SLUG ? 'restaurant_dev' : slug;
  const values = Object.entries(QR_TEST_TABLES)
    .map(([code, fixture]) => {
      const secret = QR_SECRETS[code as TableCode] ?? `${code.toLowerCase()}-secret-fixed`;
      const label = code === 'QRTEST91' ? 'QR Teste 91' : 'QR Teste 92';
      return `(${sqlLiteral(code)}, ${sqlLiteral(label)}, ${sqlLiteral(secret)}, ${sqlLiteral(fixture.publicToken)}, 2, ${fixture.tableNumber})`;
    })
    .join(', ');

  psql(`
    INSERT INTO ${schema}.tables
      (code, label, qr_hmac_secret, qr_public_token, capacity, sort_order)
    VALUES ${values}
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label,
          qr_hmac_secret = EXCLUDED.qr_hmac_secret,
          qr_public_token = EXCLUDED.qr_public_token,
          capacity = EXCLUDED.capacity,
          sort_order = EXCLUDED.sort_order,
          is_active = true,
          updated_at = now();
  `);
}

export function resetQrTables(
  tableCodes: TableCode[] = ['QRTEST91', 'QRTEST92'],
  slug = DEFAULT_SLUG,
): void {
  const schema = slug === DEFAULT_SLUG ? 'restaurant_dev' : slug;
  ensureQrFixtures(slug);
  const codes = tableCodes.map(sqlLiteral).join(', ');
  psql(`
    WITH target_tables AS (
      SELECT id FROM ${schema}.tables WHERE code IN (${codes})
    ),
    target_reqs AS (
      SELECT id, escalation_chain_id
        FROM ${schema}.scan_verification_requests
       WHERE table_id IN (SELECT id FROM target_tables)
    ),
    deleted_reqs AS (
      DELETE FROM ${schema}.scan_verification_requests
       WHERE id IN (SELECT id FROM target_reqs)
       RETURNING id
    )
    DELETE FROM ${schema}.escalation_chains
     WHERE id IN (
       SELECT escalation_chain_id
         FROM target_reqs
        WHERE escalation_chain_id IS NOT NULL
     );

    DELETE FROM ${schema}.table_qr_releases
     WHERE table_id IN (SELECT id FROM ${schema}.tables WHERE code IN (${codes}));

    UPDATE ${schema}.table_sessions
       SET status = 'closed',
           closed_at = COALESCE(closed_at, now()),
           updated_at = now()
     WHERE status = 'active'
       AND table_id IN (SELECT id FROM ${schema}.tables WHERE code IN (${codes}));
  `);
}

export async function resolveQr(tableCode: TableCode = 'QRTEST91'): Promise<ResolvedQr> {
  const token = QR_TEST_TABLES[tableCode].publicToken;
  const response = await fetch(`${API_BASE_URL}/qr/${token}`, {
    redirect: 'manual',
  });
  expect(response.status).toBe(302);
  const redirectUrl = response.headers.get('location');
  if (!redirectUrl) throw new Error(`Resolver did not return Location for ${tableCode}`);
  const url = new URL(redirectUrl);
  return {
    redirectUrl,
    slug: url.pathname.split('/').filter(Boolean)[0],
    tableCode: url.pathname.split('/').filter(Boolean)[2],
    hmac: url.searchParams.get('hmac') ?? '',
    ts: url.searchParams.get('ts') ?? '',
    accessToken: url.searchParams.get('accessToken') ?? '',
  };
}

export async function initSession(
  qr: ResolvedQr,
  overrides: Partial<{
    slug: string;
    tableCode: string;
    hmacSignature: string;
    timestamp: string;
    accessToken: string | null;
  }> = {},
): Promise<SessionInitResult> {
  const body: Record<string, unknown> = {
    tableCode: overrides.tableCode ?? qr.tableCode,
    hmacSignature: overrides.hmacSignature ?? qr.hmac,
    timestamp: overrides.timestamp ?? qr.ts,
  };
  if (overrides.accessToken !== null) {
    body.accessToken = overrides.accessToken === undefined ? qr.accessToken : overrides.accessToken;
  }
  const response = await fetch(`${API_BASE_URL}/${overrides.slug ?? qr.slug}/session/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body: payload,
    setCookie: response.headers.get('set-cookie'),
  };
}

export async function welcomeCustomer(input: {
  slug?: string;
  sessionToken: string;
  name: string;
  cpf: string;
  location?: Record<string, unknown>;
  recognitionCookie?: string | null;
  ipSuffix?: number;
}): Promise<WelcomeResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-session-token': input.sessionToken,
    'x-forwarded-for': syntheticIp(input.ipSuffix ?? ++welcomeIpCounter),
  };
  if (input.recognitionCookie) {
    headers.cookie = input.recognitionCookie;
  }
  const response = await fetch(`${API_BASE_URL}/${input.slug ?? DEFAULT_SLUG}/customer/welcome`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: input.name,
      cpf: input.cpf,
      location: input.location ?? {
        status: 'granted',
        latitude: -23.56,
        longitude: -46.64,
        accuracyMeters: 12,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body: payload,
    recognitionCookie: extractCookie(response.headers.get('set-cookie'), 'recognition_token'),
  };
}

export async function scanAndWelcome(input: {
  tableCode?: TableCode;
  name: string;
  cpf: string;
  preRelease?: boolean;
  location?: Record<string, unknown>;
}): Promise<{
  qr: ResolvedQr;
  session: SessionInitResult & { sessionId: string };
  welcome: WelcomeResult & { customerId: string; visitId: string; recognitionCookie: string };
}> {
  if (input.preRelease) {
    await preReleaseTable(input.tableCode ?? 'QRTEST91');
  }
  const qr = await resolveQr(input.tableCode ?? 'QRTEST91');
  const session = await initSession(qr);
  expect(session.status).toBe(201);
  if (!session.body.sessionId) throw new Error('session/init did not return sessionId');
  if (!session.body.token) throw new Error('session/init did not return opaque auth token');
  const welcome = await welcomeCustomer({
    sessionToken: session.body.token,
    name: input.name,
    cpf: input.cpf,
    location: input.location,
  });
  expect(welcome.status).toBe(201);
  if (!welcome.body.customerId || !welcome.body.visitId || !welcome.recognitionCookie) {
    throw new Error(
      `welcome did not return expected customer/cookie: ${JSON.stringify(welcome.body)}`,
    );
  }
  return {
    qr,
    session: { ...session, sessionId: session.body.sessionId },
    welcome: {
      ...welcome,
      customerId: welcome.body.customerId,
      visitId: welcome.body.visitId,
      recognitionCookie: welcome.recognitionCookie,
    },
  };
}

export function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)(${name}=[^;]+)`));
  return match?.[1] ?? null;
}

export async function staffByRole(
  role: 'owner' | 'manager' | 'host' | 'waiter' | 'cook' | 'bartender' | 'cashier' = 'manager',
  slug = DEFAULT_SLUG,
): Promise<StaffRow> {
  if (!/^[a-z0-9_]+$/i.test(slug)) throw new Error(`Invalid tenant schema: ${slug}`);
  const preferred = psqlJson<StaffRow>(
    `SELECT id, name, role, cpf
       FROM ${slug}.staff
      WHERE is_active = true
        AND cpf IS NOT NULL
        AND role = ${sqlLiteral(role)}
      ORDER BY CASE WHEN cpf LIKE '9000000000%' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`,
  )[0];
  if (preferred) return preferred;
  const fallback = psqlJson<StaffRow>(
    `SELECT id, name, role, cpf
       FROM ${slug}.staff
      WHERE is_active = true AND cpf IS NOT NULL
      ORDER BY CASE WHEN role = 'manager' THEN 0 WHEN role = 'waiter' THEN 1 ELSE 2 END, created_at ASC
      LIMIT 1`,
  )[0];
  if (!fallback) throw new Error(`No active staff with login CPF found in ${slug}`);
  return fallback;
}

const staffSessionTokens = new Map<string, Promise<string>>();

async function loginStaff(staff: StaffRow, slug: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/${slug}/staff-auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cpf: staff.cpf, pin: process.env.E2E_STAFF_PIN ?? '1234' }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    staffToken?: string;
    message?: string;
    message_user?: string;
  };
  if (!response.ok || !body.staffToken) {
    throw new Error(
      `Real staff login failed for ${slug}/${staff.role}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body.staffToken;
}

async function staffSessionToken(staff: StaffRow, slug: string): Promise<string> {
  const key = `${slug}:${staff.id}`;
  const cached = staffSessionTokens.get(key);
  if (cached) return cached;
  const pending = loginStaff(staff, slug).catch((error) => {
    staffSessionTokens.delete(key);
    throw error;
  });
  staffSessionTokens.set(key, pending);
  return pending;
}

export async function staffFetch<T>(
  path: string,
  options: RequestInit & { staff?: StaffRow } = {},
): Promise<ApiResponse<T>> {
  const { staff: explicitStaff, headers: optionHeaders, ...requestOptions } = options;
  const slug = path.split('/').filter(Boolean)[0] ?? DEFAULT_SLUG;
  const staff = explicitStaff ?? (await staffByRole('manager', slug));
  const token = await staffSessionToken(staff, slug);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      'content-type': 'application/json',
      'x-staff-token': token,
      ...((optionHeaders as Record<string, string> | undefined) ?? {}),
    },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as T,
    headers: response.headers,
  };
}

export async function preReleaseTable(tableCode: TableCode = 'QRTEST91'): Promise<void> {
  const manager = await staffByRole('manager');
  const tableNumber = QR_TEST_TABLES[tableCode].tableNumber;
  const response = await staffFetch<{ ok?: true; message?: string }>(
    `/${DEFAULT_SLUG}/host/tables/${tableNumber}/liberate`,
    {
      method: 'POST',
      staff: manager,
      body: JSON.stringify({ mode: 'auto', reason: 'physical QR E2E pre-release' }),
    },
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`preReleaseTable failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
}

export async function approveScanRequest(id: string, staff?: StaffRow) {
  return staffFetch<unknown>(`/${DEFAULT_SLUG}/scan-verification-requests/${id}/approve`, {
    method: 'POST',
    staff: staff ?? (await staffByRole('manager')),
    body: JSON.stringify({}),
  });
}

export async function rejectScanRequest(id: string, reason: string, staff?: StaffRow) {
  return staffFetch<unknown>(`/${DEFAULT_SLUG}/scan-verification-requests/${id}/reject`, {
    method: 'POST',
    staff: staff ?? (await staffByRole('manager')),
    body: JSON.stringify({ reason }),
  });
}

export function activeSessions(
  tableCode: TableCode,
): Array<{ id: string; host_customer_id: string | null }> {
  return psqlJson(
    `SELECT ts.id, ts.host_customer_id
       FROM restaurant_dev.table_sessions ts
       JOIN restaurant_dev.tables t ON t.id = ts.table_id
      WHERE t.code = ${sqlLiteral(tableCode)}
        AND ts.status = 'active'
      ORDER BY ts.created_at DESC`,
  );
}

export function participantsForSession(sessionId: string): ParticipantRow[] {
  return psqlJson<ParticipantRow>(
    `SELECT sp.table_session_id,
            sp.customer_id,
            sp.status,
            sp.color_index,
            ts.host_customer_id,
            c.name AS customer_name
       FROM restaurant_dev.session_participants sp
       JOIN restaurant_dev.customers c ON c.id = sp.customer_id
       JOIN restaurant_dev.table_sessions ts ON ts.id = sp.table_session_id
      WHERE sp.table_session_id = ${sqlLiteral(sessionId)}
        AND sp.left_at IS NULL
      ORDER BY sp.joined_at ASC`,
  );
}

export function latestScanRequest(tableCode: TableCode): ScanRequestRow | null {
  return (
    psqlJson<ScanRequestRow>(
      `SELECT svr.id,
              svr.table_session_id,
              svr.table_id,
              t.code AS table_code,
              svr.customer_id,
              svr.status,
              svr.location_status,
              svr.escalation_level,
              svr.escalation_chain_id,
              svr.ttl_expires_at,
              svr.decided_at,
              svr.rejection_reason,
              svr.approved_by_staff_id,
              svr.rejected_by_staff_id
         FROM restaurant_dev.scan_verification_requests svr
         JOIN restaurant_dev.tables t ON t.id = svr.table_id
        WHERE t.code = ${sqlLiteral(tableCode)}
        ORDER BY svr.created_at DESC
        LIMIT 1`,
    )[0] ?? null
  );
}

export function scanRequests(tableCode: TableCode): ScanRequestRow[] {
  return psqlJson<ScanRequestRow>(
    `SELECT svr.id,
            svr.table_session_id,
            svr.table_id,
            t.code AS table_code,
            svr.customer_id,
            svr.status,
            svr.location_status,
            svr.escalation_level,
            svr.escalation_chain_id,
            svr.ttl_expires_at,
            svr.decided_at,
            svr.rejection_reason,
            svr.approved_by_staff_id,
            svr.rejected_by_staff_id
       FROM restaurant_dev.scan_verification_requests svr
       JOIN restaurant_dev.tables t ON t.id = svr.table_id
      WHERE t.code = ${sqlLiteral(tableCode)}
      ORDER BY svr.created_at DESC`,
  );
}

export function releases(tableCode: TableCode): ReleaseRow[] {
  return psqlJson<ReleaseRow>(
    `SELECT r.id,
            r.table_id,
            r.consumed_at,
            r.consumed_by_session_id,
            r.consumed_by_customer_id,
            r.expires_at
       FROM restaurant_dev.table_qr_releases r
       JOIN restaurant_dev.tables t ON t.id = r.table_id
      WHERE t.code = ${sqlLiteral(tableCode)}
      ORDER BY r.created_at DESC`,
  );
}

export function chainForRequest(requestId: string): ChainRow | null {
  return (
    psqlJson<ChainRow>(
      `SELECT id,
              kind::text AS kind,
              source_id,
              level,
              current_assignee_role,
              ttl_expires_at,
              completed_at,
              resolution_notes
         FROM restaurant_dev.escalation_chains
        WHERE source_id = ${sqlLiteral(requestId)}
        ORDER BY created_at DESC
        LIMIT 1`,
    )[0] ?? null
  );
}

export function forceReleaseExpired(tableCode: TableCode): void {
  psql(`
    UPDATE restaurant_dev.table_qr_releases r
       SET expires_at = now() - interval '1 second',
           updated_at = now()
      FROM restaurant_dev.tables t
     WHERE t.id = r.table_id
       AND t.code = ${sqlLiteral(tableCode)}
       AND r.consumed_at IS NULL;
  `);
}

export function forceCurrentEscalationStepExpired(requestId: string): void {
  psql(`
    UPDATE restaurant_dev.escalation_chains
       SET ttl_expires_at = now() - interval '1 second',
           updated_at = now()
     WHERE source_id = ${sqlLiteral(requestId)}
       AND completed_at IS NULL;
    UPDATE restaurant_dev.scan_verification_requests
       SET ttl_expires_at = now() - interval '1 second',
           updated_at = now()
     WHERE id = ${sqlLiteral(requestId)}
       AND status = 'pending';
  `);
}

export async function waitFor<T>(
  fn: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 15_000,
  intervalMs = 500,
): Promise<T> {
  const started = Date.now();
  let last = fn();
  while (Date.now() - started < timeoutMs) {
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = fn();
  }
  throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(last)}`);
}

export function makeDailyAccessToken(
  tableCode: TableCode,
  date: Date,
  secret = QR_SECRETS[tableCode],
): string {
  const day = date.toISOString().slice(0, 10);
  const signature = createHmac('sha256', secret)
    .update(`qr-access:${tableCode}:${day}`)
    .digest('hex');
  return `${day}.${signature}`;
}

export function makeHmac(tableCode: TableCode, timestamp: string): string {
  return createHmac('sha256', QR_SECRETS[tableCode])
    .update(`${tableCode}:${timestamp}`)
    .digest('hex');
}

export function nextCpf(seed: number): string {
  const base = String(820000000 + seed).slice(0, 9);
  const d1 = cpfDigit(base);
  const d2 = cpfDigit(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

function cpfDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += Number(input[i]) * (input.length + 1 - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

export async function grantLocation(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -23.561, longitude: -46.655 });
}

export async function fillWelcome(page: Page, name: string, cpf: string): Promise<void> {
  await page.getByPlaceholder('Seu nome').pressSequentially(name, { delay: 10 });
  await page.getByPlaceholder('000.000.000-00').pressSequentially(cpf, { delay: 10 });
  await expect(page.getByTestId('welcome-submit')).toBeEnabled({ timeout: 5_000 });
  await page.getByTestId('welcome-submit').click();
}

export async function openCustomerViaQr(page: Page, tableCode: TableCode): Promise<void> {
  await page.goto(`${API_BASE_URL}/qr/${QR_TEST_TABLES[tableCode].publicToken}`, {
    waitUntil: 'networkidle',
  });
}

export async function connectStaffSocket(input: {
  staff: StaffRow;
  role: 'host' | 'manager' | 'waiter';
  events: string[];
}): Promise<{ socket: Socket; seen: Array<{ event: string; payload: unknown }> }> {
  const seen: Array<{ event: string; payload: unknown }> = [];
  const wsUrl = process.env.E2E_WS_BASE_URL ?? 'http://localhost:3001';
  const token = await staffSessionToken(input.staff, DEFAULT_SLUG);
  const socket = io(wsUrl, {
    path: '/socket.io/',
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: {
      cookie: `staff_token=${token}`,
      'x-tenant-slug': DEFAULT_SLUG,
    },
    auth: {
      tenantSlug: DEFAULT_SLUG,
      role: input.role,
    },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('staff socket connect timeout')), 5_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.emit('join:tenant', { slug: DEFAULT_SLUG, role: input.role });
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  for (const event of input.events) {
    socket.on(event, (payload) => seen.push({ event, payload }));
  }
  return { socket, seen };
}

export async function ensureOtherTenant(): Promise<void> {
  psql(`
    INSERT INTO public.plans
      (name, description, price_cents, features, max_tables, max_staff, max_ai_messages_per_day)
    VALUES ('E2E', 'Tenant E2E', 0, '{}'::jsonb, 20, 10, 500)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.restaurants
      (slug, schema_name, name, plan_id, owner_email, owner_name)
    VALUES (
      ${sqlLiteral(OTHER_SLUG)},
      ${sqlLiteral(OTHER_SLUG)},
      'Restaurante E2E Isolado',
      (SELECT id FROM public.plans LIMIT 1),
      'e2e-other@example.com',
      'E2E Other'
    )
    ON CONFLICT (slug) DO UPDATE
      SET schema_name = EXCLUDED.schema_name,
          is_active = true,
          updated_at = now();
  `);

  // Tenant REAL com TODAS as migrations + tracking em __migrations__.
  // Antes: 4 tabelas via LIKE sem __migrations__ — o migrate-tenants do
  // boot (FATAL desde 2026-06-10) tentava aplicar as 55 migrations num
  // schema meio-copiado e derrubava a API inteira (achado dessa decisão).
  psql(`
    DROP SCHEMA IF EXISTS ${OTHER_SLUG} CASCADE;
    CREATE SCHEMA ${OTHER_SLUG};
    CREATE TABLE ${OTHER_SLUG}.__migrations__ (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const migrationsDir = join(__dirname, '../../../../packages/database/migrations/tenant-template');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    psql(`SET search_path TO ${OTHER_SLUG};\n${sql}`);
    psql(
      `INSERT INTO ${OTHER_SLUG}.__migrations__ (filename) VALUES (${sqlLiteral(file)}) ON CONFLICT DO NOTHING;`,
    );
  }

  psql(`
    INSERT INTO ${OTHER_SLUG}.tables
      (code, label, qr_hmac_secret, qr_public_token, capacity, sort_order)
    VALUES (
      'QRTESTB1',
      'QR Teste Tenant B',
      'qrtestb1-secret-fixed',
      'qrtestb1-public-token-fixed',
      2,
      191
    )
    ON CONFLICT (code) DO UPDATE
      SET label = EXCLUDED.label,
          qr_hmac_secret = EXCLUDED.qr_hmac_secret,
          qr_public_token = EXCLUDED.qr_public_token,
          is_active = true,
          updated_at = now();

    INSERT INTO ${OTHER_SLUG}.staff
      (name, role, pin_hash, is_active, cpf)
    VALUES (
      'Gerente E2E Tenant B',
      'manager',
      '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
      true,
      '91000000001'
    )
    ON CONFLICT (cpf) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          pin_hash = EXCLUDED.pin_hash,
          is_active = true,
          updated_at = now();
  `);
}
