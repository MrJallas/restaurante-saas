import { StaffService } from './staff.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * getTableDetail · bucketização honesta de pagamentos (P2 hardening).
 *
 * O payments_total agrupava só status IN ('confirmed','paid') como
 * paid_cents e 'pending' como processing_cents. `awaiting_settlement`
 * (Pix em voo pós-confirmação, A04-PAY-01) caía em NENHUM bucket → sumia
 * da view do gerente/garçom: a mesa parecia dever tudo, sem nada em voo.
 *
 * Pix aqui é stub, mas a bucketização honesta vale: dinheiro em voo é
 * `processing`, não invisível. Este teste inspeciona o SQL gerado —
 * `awaiting_settlement` tem que entrar no bucket processing (cents+count)
 * e NUNCA no paid.
 */

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

function makeService(): { service: StaffService; queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  const sessionRow = {
    id: 'ts-1',
    status: 'active',
    created_at: '2026-07-05T00:00:00Z',
    closed_at: null,
    table_id: 't-1',
    table_code: 'M1',
    table_label: 'Mesa 1',
    capacity: 4,
    party_size: 2,
    total_cents: 10000,
    paid_cents: 0,
    processing_cents: 6000,
    paid_count: 0,
    processing_count: 1,
  };
  const tenantConn = {
    getTenantSlug: () => 'acme',
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      // Primeira query = a de sessão/payments buckets. Segunda = orders.
      if (/FROM table_sessions/i.test(sql)) return [sessionRow];
      return [];
    },
  } as unknown as TenantConnectionProvider;
  const service = new StaffService(tenantConn, {} as unknown as RedisService);
  return { service, queries };
}

describe('StaffService.getTableDetail — bucket de awaiting_settlement', () => {
  it('agrupa awaiting_settlement no bucket processing (cents e count), nunca no paid', async () => {
    const { service, queries } = makeService();
    await service.getTableDetail('M1');

    const sessionQuery = queries.find((q) => /FROM table_sessions/i.test(q.sql));
    expect(sessionQuery).toBeDefined();
    const sql = sessionQuery!.sql;

    // Isola o bloco payments_total (o CASE/FILTER de bucketização).
    const paymentsBlock = sql.slice(sql.indexOf('processing_cents'));

    // O bucket processing (cents) inclui pending E awaiting_settlement.
    const processingCentsMatch = paymentsBlock.match(
      /SUM\(CASE WHEN status IN \(([^)]*)\) THEN amount_cents ELSE 0 END\)::int AS processing_cents/i,
    );
    expect(processingCentsMatch).not.toBeNull();
    expect(processingCentsMatch![1]).toMatch(/'pending'/);
    expect(processingCentsMatch![1]).toMatch(/'awaiting_settlement'/);

    // O bucket processing (count) idem.
    const processingCountMatch = paymentsBlock.match(
      /COUNT\(\*\) FILTER \(WHERE status IN \(([^)]*)\)\)::int AS processing_count/i,
    );
    expect(processingCountMatch).not.toBeNull();
    expect(processingCountMatch![1]).toMatch(/'pending'/);
    expect(processingCountMatch![1]).toMatch(/'awaiting_settlement'/);

    // awaiting_settlement NÃO pode cair no bucket paid.
    const paidCentsMatch = paymentsBlock.match(
      /SUM\(CASE WHEN status IN \(([^)]*)\) THEN amount_cents ELSE 0 END\)::int AS paid_cents/i,
    );
    expect(paidCentsMatch).not.toBeNull();
    expect(paidCentsMatch![1]).not.toMatch(/'awaiting_settlement'/);
  });
});
