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
  staffKey = process.env.E2E_STAFF_API_KEY ?? 'dev-staff-api-key-change-in-prod',
}: BuildMesaUrlOptions & { staffKey?: string } = {}): Promise<void> {
  const api = apiBaseUrl.replace(/\/$/, '');
  const staffId = await resolveHostOrManagerStaffId(api, slug);
  const tableNumber = QR_TEST_TABLES[tableCode].tableNumber;
  const response = await fetch(`${api}/${slug}/host/tables/${tableNumber}/liberate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-staff-key': staffKey,
      'x-staff-id': staffId,
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

async function resolveHostOrManagerStaffId(
  apiBaseUrl: string,
  slug: string,
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/${slug}/staff?activeOnly=true`);
  if (!response.ok) {
    throw new Error(`Failed to list staff: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    staff?: Array<{ id: string; role: string }>;
  };
  const staff =
    payload.staff?.find((s) => s.role === 'host') ??
    payload.staff?.find((s) => s.role === 'manager');
  if (!staff) {
    throw new Error('No active host or manager staff found for QR pre-release.');
  }
  return staff.id;
}
