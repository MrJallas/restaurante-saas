import { CustomersService } from './customers.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TableSessionService } from '../table-session/table-session.service';

const CPF = '39053344705';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION = {
  status: 'granted' as const,
  latitude: -15,
  longitude: -47,
  accuracyMeters: 5,
};

type PendingInsert = {
  name: string;
  token: string;
  resolve: (rows: Array<Record<string, unknown>>) => void;
};

/**
 * Simula a garantia da UNIQUE(cpf) do PostgreSQL com duas conexões distintas.
 * A barreira do SELECT força os dois requests a observarem o CPF ausente antes
 * de qualquer INSERT; a barreira do INSERT só libera quando os dois já tentaram
 * criar a conta. Assim o teste não depende do scheduler para reproduzir o TOCTOU.
 */
function makeConcurrentHarness() {
  let selectArrivals = 0;
  let releaseSelect!: () => void;
  const bothSelected = new Promise<void>((resolve) => {
    releaseSelect = resolve;
  });

  const pendingInserts: PendingInsert[] = [];
  const generatedTokens: string[] = [];
  let canonicalToken: string | null = null;
  let selectArrivalsAtFirstInsert = 0;
  let visitInsertCount = 0;
  const visitRows = new Set<string>();

  const query = jest.fn(async (rawSql: string, params: unknown[] = []): Promise<unknown> => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('SELECT geofence_latitude')) {
      return [
        {
          geofence_latitude: null,
          geofence_longitude: null,
          geofence_radius_meters: null,
          geofence_enabled: false,
        },
      ];
    }

    if (
      sql.startsWith('SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf')
    ) {
      selectArrivals += 1;
      if (selectArrivals === 2) releaseSelect();
      await bothSelected;
      return [];
    }

    if (sql.startsWith('INSERT INTO customers')) {
      if (pendingInserts.length === 0) {
        selectArrivalsAtFirstInsert = selectArrivals;
      }
      const name = params[0] as string;
      const token = params[2] as string;
      generatedTokens.push(token);

      return new Promise<Array<Record<string, unknown>>>((resolve) => {
        pendingInserts.push({ name, token, resolve });
        if (pendingInserts.length !== 2) return;

        // O primeiro INSERT ganha a UNIQUE(cpf). A decisão CPF-only usa um
        // no-op `DO UPDATE RETURNING`: o perdedor recebe a linha/token
        // canônicos do vencedor e também autentica.
        const [winner, loser] = pendingInserts;
        canonicalToken = winner.token;
        const canonicalRow = {
          id: CUSTOMER_ID,
          name: winner.name,
          recognition_token: winner.token,
          total_visits: 1,
        };
        winner.resolve([canonicalRow]);
        loser.resolve([canonicalRow]);
      });
    }

    if (sql.startsWith('INSERT INTO visits')) {
      visitInsertCount += 1;
      const key = `${String(params[1])}::${String(params[0])}`;
      if (visitRows.has(key)) return [];
      visitRows.add(key);
      return [{ id: '22222222-2222-4222-8222-222222222222' }];
    }

    if (sql.startsWith('SELECT id FROM visits WHERE customer_id')) {
      return [{ id: '22222222-2222-4222-8222-222222222222' }];
    }

    if (sql.startsWith('UPDATE customers SET total_visits')) {
      return [{ total_visits: visitRows.size }];
    }

    if (sql.startsWith('SELECT last_items, favorite_items, total_spent_cents')) {
      return [];
    }

    throw new Error(`SQL inesperado no harness concorrente: ${sql}`);
  });

  const tableSession = {
    upsertParticipant: jest.fn(async () => ({ color: '#abcdef' })),
    attachCustomerToSession: jest.fn(async () => undefined),
  } as unknown as TableSessionService;

  const makeService = () =>
    new CustomersService(
      {
        query,
        getTenantSlug: () => 'demo',
      } as unknown as TenantConnectionProvider,
      tableSession,
    );

  return {
    makeService,
    query,
    tableSession,
    generatedTokens: () => generatedTokens,
    canonicalToken: () => canonicalToken,
    selectArrivalsAtFirstInsert: () => selectArrivalsAtFirstInsert,
    visitInsertCount: () => visitInsertCount,
    visitCount: () => visitRows.size,
  };
}

describe('CustomersService.welcome — cadastro concorrente sob decisão CPF-only', () => {
  it('faz os dois requests convergirem no token canônico sem supercontar antes da visita', async () => {
    const harness = makeConcurrentHarness();
    const firstRequest = harness.makeService();
    const secondRequest = harness.makeService();

    const results = await Promise.allSettled([
      firstRequest.welcome('Ana', CPF, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, LOCATION),
      secondRequest.welcome('Beatriz', CPF, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, LOCATION),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<CustomersService['welcome']>>> =>
        result.status === 'fulfilled',
    );
    const canonicalToken = harness.canonicalToken();

    expect(harness.selectArrivalsAtFirstInsert()).toBe(2);
    expect(fulfilled).toHaveLength(2);
    expect(canonicalToken).not.toBeNull();
    expect(fulfilled.map((result) => result.value.recognitionToken)).toEqual([
      canonicalToken,
      canonicalToken,
    ]);
    expect(fulfilled.map((result) => result.value.isReturning).sort()).toEqual([false, true]);
    expect(harness.generatedTokens()).toHaveLength(2);
    expect(new Set(harness.generatedTokens()).size).toBe(2);

    expect(harness.visitInsertCount()).toBe(2);
    expect(harness.tableSession.upsertParticipant).toHaveBeenCalledTimes(2);
    expect(harness.tableSession.attachCustomerToSession).toHaveBeenCalledTimes(2);
    expect(
      harness.query.mock.calls.filter(([sql]) =>
        String(sql).includes(
          'SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf',
        ),
      ),
    ).toHaveLength(2);

    const customerInsertSql = String(
      harness.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO customers'))?.[0],
    );
    expect(customerInsertSql).toContain('ON CONFLICT (cpf) DO UPDATE');
    expect(customerInsertSql).not.toContain('total_visits = customers.total_visits + 1');
  });

  it('dois cadastros concorrentes na mesma sessão contam uma única visita', async () => {
    const harness = makeConcurrentHarness();
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const results = await Promise.all([
      harness.makeService().welcome('Ana', CPF, sessionId, null, LOCATION),
      harness.makeService().welcome('Beatriz', CPF, sessionId, null, LOCATION),
    ]);

    expect(harness.visitInsertCount()).toBe(2);
    expect(harness.visitCount()).toBe(1);
    expect(results.map((result) => result.totalVisits)).toEqual([1, 1]);

    const reconciliationSql = String(
      harness.query.mock.calls.find(([sql]) =>
        /UPDATE customers\s+SET total_visits/.test(String(sql)),
      )?.[0],
    ).replace(/\s+/g, ' ');
    expect(reconciliationSql).toContain('SELECT COUNT(*)::int FROM visits');
    expect(reconciliationSql).not.toContain('total_visits = total_visits + 1');
  });
});
