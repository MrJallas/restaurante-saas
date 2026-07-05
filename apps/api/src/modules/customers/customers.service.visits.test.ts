/**
 * P1 data-integrity (re-scan de convergência #5): `customers.total_visits`
 * SUPER-CONTA. `welcome()` e `recognize()` faziam
 * `UPDATE customers SET total_visits = total_visits + 1` INCONDICIONAL, mas a
 * linha canônica por-sessão é inserida idempotente logo depois via
 * `INSERT INTO visits ... ON CONFLICT (table_session_id, customer_id) DO NOTHING`.
 * A tabela `visits` é a fonte-da-verdade UNIQUE-protegida, mas o contador
 * denormalizado NÃO era gated na visita ser NOVA → derivava estritamente acima
 * da contagem real.
 *
 * REPRO: cliente retornante recarrega a página da mesa → recognize dispara de
 * novo → total_visits+=1 OUTRA VEZ, mas o INSERT em visits é no-op (row já
 * existe pra essa sessão). Após N reloads, total_visits infla em N enquanto
 * `visits` tem 1 row.
 *
 * FIX congelado aqui: o INSERT em `visits ... ON CONFLICT DO NOTHING RETURNING
 * id` roda PRIMEIRO; `total_visits + 1` só quando uma row foi REALMENTE
 * retornada (visita nova pra essa sessão). `last_visit_at` continua carimbado a
 * cada call ("visto por último", não "contagem"). Simétrico em welcome +
 * recognize. `isReturning`/`identify` intactos.
 *
 * O fake DB imita o driver `pg`/TypeORM: UPDATE...RETURNING volta TUPLA
 * `[rows, count]`; INSERT/SELECT voltam flat `rows[]`; o INSERT idempotente em
 * `visits` volta `[]` (flat) quando a row já existe (ON CONFLICT DO NOTHING).
 * Assim o teste não mascara o bug — força o código a gatear o incremento no
 * retorno REAL do INSERT, não em contagem crua.
 */

import { CustomersService } from './customers.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { TableSessionService } from '../table-session/table-session.service';

const GRANTED_LOCATION = {
  status: 'granted' as const,
  latitude: -15.0,
  longitude: -47.0,
  accuracy: 5,
};

const EXISTING_CUSTOMER = {
  id: 'cust-1111-1111-1111-111111111111',
  name: 'Ana',
  cpf: '39053344705', // CPF válido pelo dígito verificador (validateCpf)
  recognition_token: 'tok-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

/**
 * fakeDb mantém `total_visits` do customer e o SET de `visits`
 * (table_session_id::customer_id) em memória, e roteia as queries de
 * welcome()/recognize() imitando o driver `pg`:
 *   - SELECT             → rows[] (flat)
 *   - UPDATE...RETURNING → [rows[], affected] (tupla)  ← precisa de unwrapRows
 *   - INSERT visits ON CONFLICT DO NOTHING RETURNING id
 *        → rows[] quando inseriu de fato; [] quando conflitou (no-op)
 */
function fakeDb(startVisits = 3) {
  let totalVisits = startVisits;
  const visitRows = new Set<string>(); // `${sessionId}::${customerId}`
  let visitSeq = 0;

  const query = async (rawSql: string, params: unknown[] = []): Promise<unknown> => {
    const s = rawSql.replace(/\s+/g, ' ').trim();

    // geofence config: sem coords → evaluateCustomerGeofence passa sem checar raio
    if (s.startsWith('SELECT geofence_latitude')) {
      return [{ geofence_latitude: null, geofence_longitude: null, geofence_radius_meters: null }];
    }

    // welcome: SELECT por cpf
    if (s.startsWith('SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf')) {
      const cpf = params[0] as string;
      if (cpf === EXISTING_CUSTOMER.cpf) {
        return [
          {
            id: EXISTING_CUSTOMER.id,
            name: EXISTING_CUSTOMER.name,
            recognition_token: EXISTING_CUSTOMER.recognition_token,
            total_visits: totalVisits,
          },
        ];
      }
      return [];
    }

    // recognize: SELECT por recognition_token
    if (
      s.startsWith(
        'SELECT id, name, cpf, recognition_token, total_visits FROM customers WHERE recognition_token',
      )
    ) {
      const tok = params[0] as string;
      if (tok === EXISTING_CUSTOMER.recognition_token) {
        return [
          {
            id: EXISTING_CUSTOMER.id,
            name: EXISTING_CUSTOMER.name,
            cpf: EXISTING_CUSTOMER.cpf,
            recognition_token: EXISTING_CUSTOMER.recognition_token,
            total_visits: totalVisits,
          },
        ];
      }
      return [];
    }

    // INSERT idempotente em visits — o FIX espera `RETURNING id` aqui.
    if (s.startsWith('INSERT INTO visits')) {
      const customerId = params[0] as string;
      const sessionId = params[1] as string;
      const key = `${sessionId}::${customerId}`;
      if (visitRows.has(key)) {
        // ON CONFLICT DO NOTHING: nenhuma row inserida → pg volta rows vazias.
        return [];
      }
      visitRows.add(key);
      // Row nova inserida. Com RETURNING id, pg volta a row inserida (flat).
      return [{ id: `visit-${++visitSeq}` }];
    }

    // SELECT id FROM visits WHERE ... — usado como fallback pra pegar o visitId.
    if (s.startsWith('SELECT id FROM visits WHERE customer_id')) {
      const customerId = params[0] as string;
      const sessionId = params[1] as string;
      const key = `${sessionId}::${customerId}`;
      // Só existe se já foi inserida (o INSERT idempotente roda antes).
      return visitRows.has(key) ? [{ id: `visit-existing` }] : [];
    }

    // UPDATE total_visits + 1 → TUPLA [rows, affected] (imita pg em UPDATE).
    if (s.startsWith('UPDATE customers SET total_visits = total_visits + 1')) {
      totalVisits += 1;
      return [[{ total_visits: totalVisits }], 1];
    }

    // UPDATE só de last_visit_at (o fix pode carimbar "visto por último" sem
    // incrementar). Não mexe no contador.
    if (
      s.startsWith('UPDATE customers SET last_visit_at') ||
      (s.startsWith('UPDATE customers SET') &&
        s.includes('last_visit_at') &&
        !s.includes('total_visits = total_visits + 1'))
    ) {
      return [[], 1];
    }

    // consumption_summary (returning branch) — vazio.
    if (s.startsWith('SELECT last_items, favorite_items, total_spent_cents')) {
      return [];
    }

    // rotação de recognition_token (reclaim) — no-op.
    if (s.startsWith('UPDATE customers SET recognition_token')) {
      return [[], 1];
    }

    throw new Error(`fakeDb: SQL não roteado: ${s}`);
  };

  const conn = {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return {
    conn,
    getTotalVisits: () => totalVisits,
    getVisitCount: () => visitRows.size,
  };
}

function makeService(conn: TenantConnectionProvider) {
  // TableSessionService é totalmente stubbado: só precisa devolver `color` no
  // upsertParticipant e resolver attachCustomerToSession. Nenhuma query dele
  // toca o fakeDb.
  const tableSession = {
    upsertParticipant: jest.fn(async () => ({ color: '#abcdef' })),
    attachCustomerToSession: jest.fn(async () => undefined),
  } as unknown as TableSessionService;
  return new CustomersService(conn, tableSession);
}

describe('CustomersService.recognize — total_visits gated na visita NOVA (P1 super-count)', () => {
  it('1ª recognize da sessão conta a visita (total_visits += 1)', async () => {
    const db = fakeDb(3);
    const svc = makeService(db.conn);

    const res = await svc.recognize(
      EXISTING_CUSTOMER.recognition_token,
      'sess-1111',
      GRANTED_LOCATION,
    );

    expect(res.totalVisits).toBe(4);
    expect(db.getTotalVisits()).toBe(4);
    expect(db.getVisitCount()).toBe(1);
    expect(res.isReturning).toBe(true);
  });

  it('reload (recognize 2x na MESMA sessão) NÃO infla total_visits — só conta 1x', async () => {
    const db = fakeDb(3);
    const svc = makeService(db.conn);
    const sessionId = 'sess-reload';

    const first = await svc.recognize(EXISTING_CUSTOMER.recognition_token, sessionId, GRANTED_LOCATION);
    const second = await svc.recognize(EXISTING_CUSTOMER.recognition_token, sessionId, GRANTED_LOCATION);

    // Fonte-da-verdade: 1 row em visits pra essa sessão.
    expect(db.getVisitCount()).toBe(1);
    // Contador denormalizado NÃO deriva acima da contagem real.
    expect(db.getTotalVisits()).toBe(4);
    // O reload reusa a contagem existente, não incrementa.
    expect(first.totalVisits).toBe(4);
    expect(second.totalVisits).toBe(4);
    expect(second.isReturning).toBe(true);
  });

  it('sessões DIFERENTES contam cada uma (visita nova por sessão)', async () => {
    const db = fakeDb(3);
    const svc = makeService(db.conn);

    await svc.recognize(EXISTING_CUSTOMER.recognition_token, 'sess-a', GRANTED_LOCATION);
    await svc.recognize(EXISTING_CUSTOMER.recognition_token, 'sess-b', GRANTED_LOCATION);

    expect(db.getVisitCount()).toBe(2);
    expect(db.getTotalVisits()).toBe(5); // 3 + 2 sessões novas
  });
});

describe('CustomersService.welcome — total_visits gated na visita NOVA (P1 super-count)', () => {
  it('1ª welcome de cliente retornante na sessão conta a visita', async () => {
    const db = fakeDb(3);
    const svc = makeService(db.conn);

    const res = await svc.welcome(
      'Ana',
      EXISTING_CUSTOMER.cpf,
      'sess-w-1',
      EXISTING_CUSTOMER.recognition_token,
      GRANTED_LOCATION,
    );

    expect(res.isReturning).toBe(true);
    expect(res.totalVisits).toBe(4);
    expect(db.getTotalVisits()).toBe(4);
    expect(db.getVisitCount()).toBe(1);
  });

  it('re-submit welcome na MESMA sessão NÃO infla total_visits — só conta 1x', async () => {
    const db = fakeDb(3);
    const svc = makeService(db.conn);
    const sessionId = 'sess-w-reload';

    const first = await svc.welcome(
      'Ana',
      EXISTING_CUSTOMER.cpf,
      sessionId,
      EXISTING_CUSTOMER.recognition_token,
      GRANTED_LOCATION,
    );
    const second = await svc.welcome(
      'Ana',
      EXISTING_CUSTOMER.cpf,
      sessionId,
      EXISTING_CUSTOMER.recognition_token,
      GRANTED_LOCATION,
    );

    expect(db.getVisitCount()).toBe(1);
    expect(db.getTotalVisits()).toBe(4);
    expect(first.totalVisits).toBe(4);
    expect(second.totalVisits).toBe(4);
    expect(second.isReturning).toBe(true);
  });
});
