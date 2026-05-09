import { unwrapAffected, unwrapRows } from './query-utils';

/**
 * Plain TypeScript assertions covering the contract of `unwrapRows` and
 * `unwrapAffected`. Apps/api doesn't ship with a Jest runner today so this
 * file isn't picked up by a test command — but it is type-checked by
 * `tsc --noEmit -p apps/api/tsconfig.json`, and the runtime assertions
 * below would be the body of a `describe(... it(...))` once Jest is wired
 * up. Keeping the assertions inline as a function makes them invokable
 * manually (or via ts-node) for ad-hoc verification.
 *
 * The shapes mirror what TypeORM 0.3's PostgresQueryRunner.query() returns
 * for SELECT vs UPDATE/DELETE on the `pg` driver:
 *   - SELECT: rows[]
 *   - UPDATE/DELETE: [rows[], affectedCount]
 */

interface Row {
  id: string;
}

/* eslint-disable no-console */
export function runQueryUtilsAssertions(): void {
  // 1. SELECT-style result (flat row array) round-trips unchanged.
  const selectResult: Row[] = [{ id: 'a' }, { id: 'b' }];
  const u1 = unwrapRows<Row>(selectResult);
  if (u1.length !== 2 || u1[0].id !== 'a' || u1[1].id !== 'b') {
    throw new Error('unwrapRows SELECT shape failed');
  }
  if (unwrapAffected(selectResult) !== 2) {
    throw new Error('unwrapAffected SELECT fallback failed');
  }

  // 2. UPDATE/DELETE-style tuple [rows, affected] is unwrapped to rows[].
  const updateResult: [Row[], number] = [[{ id: 'x' }], 1];
  const u2 = unwrapRows<Row>(updateResult);
  if (u2.length !== 1 || u2[0].id !== 'x') {
    throw new Error('unwrapRows UPDATE tuple failed');
  }
  if (unwrapAffected(updateResult) !== 1) {
    throw new Error('unwrapAffected UPDATE tuple failed');
  }

  // 3. UPDATE/DELETE that matched zero rows: tuple `[[], 0]` -> [].
  const zeroAffected: [Row[], number] = [[], 0];
  const u3 = unwrapRows<Row>(zeroAffected);
  if (u3.length !== 0) {
    throw new Error('unwrapRows zero-affected tuple failed');
  }
  if (unwrapAffected(zeroAffected) !== 0) {
    throw new Error('unwrapAffected zero-affected tuple failed');
  }

  // 4. Empty SELECT result.
  const emptySelect: Row[] = [];
  if (unwrapRows<Row>(emptySelect).length !== 0) {
    throw new Error('unwrapRows empty SELECT failed');
  }

  // 5. Edge: ambiguous-looking 2-tuple of [array, non-number] should be
  //    treated as a flat row array. Specifically, `[Row, Row]` where the
  //    second element is an object rather than a number — this could only
  //    happen for SELECTs with exactly 2 rows whose first row happens to
  //    be an array-typed column (very rare but not impossible). The guard
  //    requires `typeof second === 'number'` so we don't false-positive.
  const ambiguous = [{ id: 'a' }, { id: 'b' }] as unknown;
  if (unwrapRows<Row>(ambiguous).length !== 2) {
    throw new Error('unwrapRows ambiguous 2-element flat array failed');
  }

  // 6. Null / undefined / non-array inputs: return [] / 0.
  if (unwrapRows(null).length !== 0) {
    throw new Error('unwrapRows null failed');
  }
  if (unwrapRows(undefined).length !== 0) {
    throw new Error('unwrapRows undefined failed');
  }
  if (unwrapAffected(null) !== 0) {
    throw new Error('unwrapAffected null failed');
  }
  if (unwrapAffected({ command: 'INSERT' }) !== 0) {
    throw new Error('unwrapAffected non-array failed');
  }

  console.log('query-utils assertions OK');
}

if (require.main === module) {
  runQueryUtilsAssertions();
}
