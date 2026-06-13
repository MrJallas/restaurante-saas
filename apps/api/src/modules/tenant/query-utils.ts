/**
 * Helpers for safely consuming the result of a TypeORM `QueryRunner.query()`
 * call against the `pg` driver.
 *
 * Why this exists
 * ───────────────
 * `pg` returns different shapes depending on the SQL command tag:
 *   - SELECT / INSERT / etc.        → `rows: Row[]`
 *   - UPDATE / DELETE (any RETURNING) → `[rows: Row[], affected: number]`
 *
 * TypeORM 0.3 `PostgresQueryRunner.query()` faithfully forwards that shape
 * (see `node_modules/typeorm/driver/postgres/PostgresQueryRunner.js`):
 *
 *   case "DELETE":
 *   case "UPDATE":
 *       result.raw = [raw.rows, raw.rowCount];
 *       break;
 *   default:
 *       result.raw = raw.rows;
 *
 * That meant every `qr.query("UPDATE … RETURNING …")` callsite that
 * destructured the response as a flat `Row[]` was actually reading
 * `[Row[], number]` — `rows[0]` resolved to the *array of rows* (truthy,
 * `length` is the row count), so `rows[0].something` came back `undefined`
 * and the API silently zero-ed out the body it returned. On
 * `cooldown_expires_at`-style INSERTs there is no such issue (INSERT keeps
 * the flat shape), but on `respond` / `approve` / `end` mutations the
 * mapping fell through and the WS event payload went out empty. Repro: P0
 * #4 of the consolidated bug report — complaint respond, table-merge
 * approve/reject, zone-pause end, late-arrival approve, etc.
 *
 * The right fix is to unwrap the tuple shape at the call boundary. We
 * encapsulate that here so:
 *  1. callsites don't repeat the cast,
 *  2. a future TypeORM upgrade that changes the shape can be patched in
 *     a single place.
 *
 * The helper is defensive — it accepts both the tuple form (`[rows, n]`)
 * and the flat form (`rows`). That keeps it correct even if the surrounding
 * driver path returns the structured result (e.g. through a different
 * adapter), or if a caller hands us the rows array directly after some
 * other unwrap.
 */

/**
 * Normalize the return value of `qr.query()` so the caller always sees a
 * `Row[]`. Works for SELECT/INSERT (already flat) and UPDATE/DELETE (tuple
 * `[rows, affected]`). Returns `[]` if the input is null/undefined/empty.
 */
export function unwrapRows<TRow = Record<string, unknown>>(raw: unknown): TRow[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  // UPDATE/DELETE shape: `[Row[], affectedCount]`. We detect by the second
  // element being a number AND the first being an array — that combination
  // is unique to the pg-driver mutation tuple.
  if (
    raw.length === 2 &&
    Array.isArray((raw as unknown[])[0]) &&
    typeof (raw as unknown[])[1] === 'number'
  ) {
    return (raw as [TRow[], number])[0] ?? [];
  }
  // Flat row array (SELECT / INSERT / DELETE without RETURNING-and-rowCount).
  return raw as TRow[];
}

/**
 * Convenience wrapper: extracts the affected-row count from a mutation
 * result. For non-mutation (or empty) results it returns the row array
 * length, which is a sensible fallback for callers that just want "how
 * many rows did I touch".
 */
export function unwrapAffected(raw: unknown): number {
  if (raw == null) return 0;
  if (!Array.isArray(raw)) return 0;
  if (
    raw.length === 2 &&
    Array.isArray((raw as unknown[])[0]) &&
    typeof (raw as unknown[])[1] === 'number'
  ) {
    return (raw as [unknown[], number])[1];
  }
  return raw.length;
}
