import { execSync } from 'node:child_process';

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function resetWelcomeRateLimitAndSessions(tableCodes: string[] = ['QRTEST91']): void {
  try {
    execSync(
      `docker exec restaurant-redis sh -lc "redis-cli --raw keys 'customers:welcome:*' | xargs -r redis-cli del" >/dev/null 2>&1 || true`,
      { stdio: 'ignore' },
    );

    const codes = tableCodes.map(sqlLiteral).join(', ');
    execSync(
      `docker exec restaurant-postgres psql -h localhost -p 5434 -U postgres -d restaurant_saas -c "UPDATE restaurant_dev.table_sessions SET status='closed', closed_at=NOW() WHERE table_id IN (SELECT id FROM restaurant_dev.tables WHERE code IN (${codes})) AND closed_at IS NULL;" >/dev/null 2>&1`,
      { stdio: 'ignore' },
    );
  } catch {
    /* Optional: only works when the local Docker stack is running. */
  }
}
