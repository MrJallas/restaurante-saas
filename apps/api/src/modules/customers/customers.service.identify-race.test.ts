import { CustomersService } from './customers.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TableSessionService } from '../table-session/table-session.service';

const CPF = '39053344705';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

type PendingInsert = {
  name: string;
  token: string;
  resolve: (rows: Array<Record<string, unknown>>) => void;
};

function makeHarness() {
  let selectArrivals = 0;
  let releaseSelect!: () => void;
  const bothSelected = new Promise<void>((resolve) => {
    releaseSelect = resolve;
  });
  const pendingInserts: PendingInsert[] = [];
  const generatedTokens: string[] = [];
  let canonicalToken: string | null = null;

  const query = jest.fn(async (rawSql: string, params: unknown[] = []): Promise<unknown> => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    if (
      sql.startsWith('SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf')
    ) {
      selectArrivals += 1;
      if (selectArrivals === 2) releaseSelect();
      await bothSelected;
      return [];
    }
    if (sql.startsWith('INSERT INTO customers')) {
      const pending: PendingInsert = {
        name: params[0] as string,
        token: params[2] as string,
        resolve: () => undefined,
      };
      generatedTokens.push(pending.token);
      return new Promise<Array<Record<string, unknown>>>((resolve) => {
        pending.resolve = resolve;
        pendingInserts.push(pending);
        if (pendingInserts.length !== 2) return;

        const [winner, loser] = pendingInserts;
        canonicalToken = winner.token;
        const row = {
          id: CUSTOMER_ID,
          name: winner.name,
          recognition_token: winner.token,
          total_visits: 0,
        };
        winner.resolve([row]);
        loser.resolve([row]);
      });
    }
    throw new Error(`SQL inesperado: ${sql}`);
  });

  const makeService = () =>
    new CustomersService(
      { query, getTenantSlug: () => 'demo' } as unknown as TenantConnectionProvider,
      {} as TableSessionService,
    );

  return {
    makeService,
    query,
    canonicalToken: () => canonicalToken,
    generatedTokens: () => generatedTokens,
  };
}

describe('CustomersService.identify — cadastro concorrente sob decisão CPF-only', () => {
  it('converge ambos os requests no cadastro e token canônicos', async () => {
    const harness = makeHarness();
    const results = await Promise.all([
      harness.makeService().identify(CPF, 'Ana', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      harness.makeService().identify(CPF, 'Beatriz', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ]);

    expect(harness.generatedTokens()).toHaveLength(2);
    expect(new Set(harness.generatedTokens()).size).toBe(2);
    expect(results.map((result) => result.recognitionToken)).toEqual([
      harness.canonicalToken(),
      harness.canonicalToken(),
    ]);
    expect(results.map((result) => result.canonicalName)).toEqual(['Ana', 'Ana']);
    expect(results.map((result) => result.isReturning).sort()).toEqual([false, true]);

    const insertSql = String(
      harness.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO customers'))?.[0],
    );
    expect(insertSql).toContain('ON CONFLICT (cpf) DO UPDATE');
  });
});
