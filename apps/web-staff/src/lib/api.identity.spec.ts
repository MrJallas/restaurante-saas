/**
 * Executable contract assertions for staff API identity headers.
 *
 * Run with:
 *   TS_NODE_PROJECT=apps/web-staff/tsconfig.json TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register apps/web-staff/src/lib/api.identity.spec.ts
 */

import { resolveStaffIdentityHeaders } from './api';

const MANAGER_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';

function fakeStorage(initial: Record<string, string | null> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    if (value !== null) data.set(key, value);
  }
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    snapshot: () => Object.fromEntries(data.entries()),
  };
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: got ${a}, expected ${e}`);
  }
}

/* eslint-disable no-console */
export function runStaffApiIdentityAssertions(): void {
  const managerStorage = fakeStorage();
  assertEqual(
    resolveStaffIdentityHeaders(new URLSearchParams(`managerId=${MANAGER_ID}`), managerStorage),
    { 'x-staff-id': MANAGER_ID, 'x-staff-role': 'manager' },
    'managerId query seeds manager identity',
  );
  assertEqual(
    managerStorage.snapshot(),
    { staffId: MANAGER_ID, staffRole: 'manager' },
    'manager identity persisted',
  );

  const invalidExplicitStorage = fakeStorage({
    staffId: MANAGER_ID,
    staffRole: 'manager',
  });
  assertEqual(
    resolveStaffIdentityHeaders(
      new URLSearchParams('cookId=kitchen-display'),
      invalidExplicitStorage,
    ),
    {},
    'invalid explicit identity does not reuse stale localStorage',
  );
  assertEqual(
    invalidExplicitStorage.snapshot(),
    { staffId: MANAGER_ID, staffRole: 'manager' },
    'invalid explicit identity does not overwrite storage',
  );

  const storedStorage = fakeStorage({ staffId: HOST_ID, staffRole: 'host' });
  assertEqual(
    resolveStaffIdentityHeaders(new URLSearchParams(''), storedStorage),
    { 'x-staff-id': HOST_ID, 'x-staff-role': 'host' },
    'valid stored identity is used when no explicit query identity exists',
  );

  const staleStorage = fakeStorage({ staffId: 'not-a-uuid', staffRole: 'manager' });
  assertEqual(
    resolveStaffIdentityHeaders(new URLSearchParams(''), staleStorage),
    {},
    'invalid stored identity is not sent',
  );
  assertEqual(
    staleStorage.snapshot(),
    { staffRole: 'manager' },
    'invalid stored staffId is cleared',
  );

  console.log('staff api identity assertions OK');
}

if (require.main === module) {
  runStaffApiIdentityAssertions();
}
