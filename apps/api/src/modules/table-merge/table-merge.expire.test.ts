/**
 * REGRESSÃO OOM 2026-07-04: `expireOverdueRequests` lia o retorno de
 * `UPDATE … RETURNING` como `Row[]`, mas o pg/TypeORM devolve a tupla
 * `[rows, rowCount]` (ver query-utils.ts). Com isso `expired.length === 0`
 * nunca era verdade (length é sempre 2), o `for` iterava `[[], 0]` e
 * `getById(undefined)` re-entrava em `expireOverdueRequests` — recursão
 * mútua infinita alocando ~33MB/s até o heap estourar. Bastava UM
 * GET /:slug/table-merge-requests (poll do dashboard staff) pra derrubar a
 * API em ~3min. O request nunca respondia, então nem request_timing logava.
 *
 * Diferente dos fakes de characterization (que devolvem `[]` no expire e
 * por isso nunca flagraram o bug), o fake daqui emula o shape FIEL do
 * driver. O budget de queries transforma a recursão infinita em falha
 * determinística de teste.
 */

import { TableMergeService } from './table-merge.service';
import { MergeTargetResolver } from './merge-target-resolver';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const REQ = 'dddd4444-0000-4000-8000-000000000004';
const SOURCE = 'aaaa1111-0000-4000-8000-000000000001';
const TARGET = 'bbbb2222-0000-4000-8000-000000000002';

const QUERY_BUDGET = 50;

function enrich(id: string) {
  return {
    id,
    source_table_session_id: SOURCE,
    target_table_session_id: TARGET,
    requesting_customer_id: 'cccc3333-0000-4000-8000-000000000003',
    target_customer_id: null,
    decided_by_customer_id: null,
    status: 'expired',
    message: null,
    ttl_expires_at: '2026-07-04T00:10:00.000Z',
    decided_at: '2026-07-04T00:15:00.000Z',
    approved_by_a_at: null,
    approved_by_b_at: null,
    created_at: '2026-07-04T00:00:00.000Z',
    origin_table_number: 5,
    target_table_number: 7,
    origin_host_name: 'Ana',
    target_host_name: 'Bruno',
    origin_party_size: 2,
    target_party_size: 3,
  };
}

/**
 * Fake do tenantConn com a semântica REAL do pg:
 *   UPDATE … RETURNING → `[rows, rowCount]` (tupla)
 *   SELECT             → `rows` (flat)
 * `expiredIds` alimenta só a PRIMEIRA chamada do UPDATE de expire (as
 * seguintes devolvem `[[], 0]`, como o banco depois do flip de status).
 */
function fakePgDb(expiredIds: string[] = []) {
  let expireCalls = 0;
  const counters = { queries: 0 };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    if (++counters.queries > QUERY_BUDGET) {
      throw new Error(
        `query budget estourado (>${QUERY_BUDGET}) — expireOverdueRequests em recursão?`,
      );
    }
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith("UPDATE table_merge_requests SET status = 'expired'")) {
      const rows = expireCalls++ === 0 ? expiredIds.map((id) => ({ id })) : [];
      return [rows, rows.length] as unknown as unknown[];
    }

    // list() (sem params) e o fetch por id (params=[id]) compartilham o
    // prefixo `SELECT mr.*,`.
    if (s.startsWith('SELECT mr.*,')) {
      if (params.length === 0) return [];
      return params[0] === REQ ? [enrich(REQ)] : [];
    }

    throw new Error(`fake expire: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return { conn, counters };
}

function makeService(expiredIds: string[] = []) {
  const { conn, counters } = fakePgDb(expiredIds);
  const events = {
    emitTableMergeCreated: jest.fn(),
    emitTableMergeApproved: jest.fn(),
    emitTableMergeRejected: jest.fn(),
    emitMergeCooldownStarted: jest.fn(),
  };
  const service = new TableMergeService(
    conn,
    new MergeTargetResolver(conn),
    events as unknown as EventsGateway,
  );
  return { service, events, counters };
}

describe('TableMergeService — expireOverdueRequests com shape real do pg (tupla RETURNING)', () => {
  it('list() sem nada expirado termina em poucas queries e não emite evento', async () => {
    const { service, events, counters } = makeService([]);

    await expect(service.list({})).resolves.toEqual([]);

    expect(counters.queries).toBeLessThanOrEqual(5);
    expect(events.emitTableMergeRejected).not.toHaveBeenCalled();
  });

  it('getById() não re-entra no sweep ao enriquecer (sem recursão mútua)', async () => {
    const { service, counters } = makeService([]);

    const result = await service.getById(REQ);

    expect(result.id).toBe(REQ);
    expect(counters.queries).toBeLessThanOrEqual(5);
  });

  it('request expirado emite table_merge.rejected timeout UMA vez e termina', async () => {
    const { service, events, counters } = makeService([REQ]);

    await expect(service.list({})).resolves.toEqual([]);

    expect(events.emitTableMergeRejected).toHaveBeenCalledTimes(1);
    const [slug, srcId, tgtId, payload] = events.emitTableMergeRejected.mock.calls[0];
    expect(slug).toBe('demo');
    expect(srcId).toBe(SOURCE);
    expect(tgtId).toBe(TARGET);
    expect(payload).toMatchObject({ requestId: REQ, rejectedBy: 'timeout' });
    expect(counters.queries).toBeLessThanOrEqual(8);
  });
});
