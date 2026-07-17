/**
 * Fixed physical QR fixtures for customer E2E tests.
 *
 * Tests must enter through the public QR resolver, not by recreating HMACs in
 * the browser suite. These tokens are seeded in
 * `packages/database/seeds/demo/demo_data.sql` and are meant to stay stable
 * until the rows are manually removed from the dev tenant.
 */

export const QR_TEST_TABLES = {
  QRTEST91: {
    tableNumber: 91,
    publicToken: 'qrtest91-public-token-fixed',
  },
  QRTEST92: {
    tableNumber: 92,
    publicToken: 'qrtest92-public-token-fixed',
  },
} as const;

export type TableCode = keyof typeof QR_TEST_TABLES;

export interface BuildMesaUrlOptions {
  slug?: string;
  tableCode?: TableCode;
  apiBaseUrl?: string;
}

export function buildMesaUrl({
  tableCode = 'QRTEST91',
  apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api',
}: BuildMesaUrlOptions = {}): string {
  const token = QR_TEST_TABLES[tableCode].publicToken;
  return `${apiBaseUrl.replace(/\/$/, '')}/qr/${token}`;
}

export async function liberateQrTestTable({
  slug = 'restaurant_dev',
  tableCode = 'QRTEST91',
  apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api',
}: BuildMesaUrlOptions = {}): Promise<void> {
  const api = apiBaseUrl.replace(/\/$/, '');
  const staffToken = await loginHost(api, slug);
  const tableNumber = QR_TEST_TABLES[tableCode].tableNumber;
  const response = await fetch(`${api}/${slug}/host/tables/${tableNumber}/liberate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-staff-token': staffToken,
    },
    body: JSON.stringify({
      mode: 'auto',
      reason: 'playwright qr entry pre-release',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to pre-release ${tableCode}: ${response.status} ${await response.text()}`,
    );
  }
}

async function loginHost(apiBaseUrl: string, slug: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/${slug}/staff-auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cpf: process.env.E2E_HOST_CPF ?? '90000000002',
      pin: process.env.E2E_STAFF_PIN ?? '1234',
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { staffToken?: string };
  if (!response.ok || !payload.staffToken) {
    throw new Error(`Failed to authenticate host: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.staffToken;
}
