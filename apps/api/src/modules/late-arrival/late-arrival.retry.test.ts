/**
 * P1 retry-safety (re-scan #8): POST /:slug/late-arrival-requests não era
 * idempotente. LateArrivalService.create() fazia INSERT cru em
 * late_arrival_requests (status='pending') numa tx que TAMBÉM inseria uma
 * escalation_chains nova, SEM dedup por (customer_id, table_session_id,
 * status='pending'). Sob um retry do cliente (o api() aborta em 15s e o catch
 * libera o botão), a MESMA request virava N requests 'pending' + N chains pro
 * mesmo joiner → host via N prompts idênticos, cada chain escalando sozinha.
 *
 * Fix (mig 066 + ON CONFLICT): INSERT ... ON CONFLICT (table_session_id,
 * customer_id) WHERE status='pending' DO NOTHING RETURNING; no conflito, busca e
 * retorna a request 'pending' existente SEM criar 2ª chain.
 *
 * RED→GREEN: create() 2x pro mesmo (session, customer) → 1 request + 1 chain
 * (antes: 2 requests + 2 chains). E o 2º create não re-emite late_arrival:created.
 */

import { LateArrivalService } from './late-arrival.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const SESSION = 'aaaa1111-0000-4000-8000-000000000001';
const CUSTOMER = 'bbbb2222-0000-4000-8000-000000000002';
const SLUG = 'restaurant_dev';

interface FakeRow {
  id: string;
  visit_id: string | null;
  table_session_id: string | null;
  customer_id: string;
  status: string;
  escalation_chain_id: string | null;
  expected_arrival_at: string;
  ttl_expires_at: string;
  decided_at: string | null;
  escalation_level: number;
  message: string | null;
  created_at: string;
  requested_at: string;
  approved_by_staff_id: string | null;
  approved_by_customer_id: string | null;
}

/**
 * DB fake que modela a semântica do índice único parcial `late_arrival_pending_unique`
 * (mig 066): no máximo 1 request 'pending' por (table_session_id, customer_id).
 *
 * - INSERT ... ON CONFLICT ... DO NOTHING RETURNING: insere só se não houver
 *   'pending' pro par; senão retorna [] (0 linhas), espelhando o DO NOTHING real.
 * - SELECT do request 'pending' existente: devolve a linha viva.
 * - INSERT escalation_chains: cria uma chain e conta.
 *
 * Conta requests 'pending' vivos e chains criadas pra provar que o retry não duplica.
 */
function makeService() {
  const requests: FakeRow[] = [];
  const chains: Array<{ id: string; source_id: string }> = [];
  let reqSeq = 0;
  let chainSeq = 0;

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // INSERT ... ON CONFLICT (table_session_id, customer_id) WHERE status='pending' DO NOTHING
    if (s.startsWith('INSERT INTO late_arrival_requests')) {
      const [visitId, tableSessionId, customerId, expectedArrivalAt, ttlExpiresAt, message] =
        params as (string | null)[];
      const conflict = requests.some(
        (r) =>
          r.status === 'pending' &&
          r.table_session_id === tableSessionId &&
          r.customer_id === customerId,
      );
      if (conflict) {
        // DO NOTHING → 0 linhas.
        return [];
      }
      reqSeq += 1;
      const now = new Date().toISOString();
      const row: FakeRow = {
        id: `req-${reqSeq}`,
        visit_id: visitId,
        table_session_id: tableSessionId,
        customer_id: customerId as string,
        status: 'pending',
        escalation_chain_id: null,
        expected_arrival_at: expectedArrivalAt as string,
        ttl_expires_at: ttlExpiresAt as string,
        decided_at: null,
        escalation_level: 0,
        message: message,
        created_at: now,
        requested_at: now,
        approved_by_staff_id: null,
        approved_by_customer_id: null,
      };
      requests.push(row);
      return [row];
    }

    // Fallback do conflito: SELECT * FROM late_arrival_requests WHERE ... status='pending'
    if (s.startsWith('SELECT * FROM late_arrival_requests') && s.includes("status = 'pending'")) {
      const [tableSessionId, customerId] = params as (string | null)[];
      const found = requests
        .filter(
          (r) =>
            r.status === 'pending' &&
            r.table_session_id === tableSessionId &&
            r.customer_id === customerId,
        )
        .slice(-1);
      return found;
    }

    // INSERT escalation_chains ... RETURNING id
    if (s.startsWith('INSERT INTO escalation_chains')) {
      const [sourceId] = params as string[];
      chainSeq += 1;
      const chain = { id: `chain-${chainSeq}`, source_id: sourceId };
      chains.push(chain);
      return [{ id: chain.id }];
    }

    // UPDATE late_arrival_requests SET escalation_chain_id = ...
    if (s.startsWith('UPDATE late_arrival_requests')) {
      const [id, chainId] = params as string[];
      const row = requests.find((r) => r.id === id);
      if (row) row.escalation_chain_id = chainId;
      return [];
    }

    // getById: SELECT lar.*, ... com joins. Devolve a linha + colunas do join nulas.
    if (s.startsWith('SELECT lar.*')) {
      const [id] = params as string[];
      const row = requests.find((r) => r.id === id);
      if (!row) return [];
      return [{ ...row, table_number: null, requester_name: null, total_visits: null }];
    }

    throw new Error(`fake late-arrival: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(cb: (tx: { query: typeof query }) => Promise<T>) => cb({ query }),
  } as unknown as TenantConnectionProvider;

  const emitted: Array<{ requestId: string }> = [];
  const events = {
    emitLateArrivalCreated: (
      _slug: string,
      _visitId: string | null,
      payload: { requestId: string },
    ) => {
      emitted.push({ requestId: payload.requestId });
    },
  } as unknown as EventsGateway;

  const service = new LateArrivalService(conn, events);
  return {
    service,
    emitted,
    countPendingRequests: () => requests.filter((r) => r.status === 'pending').length,
    countChains: () => chains.length,
  };
}

describe('LateArrivalService.create — retry não duplica (P1 retry-safety)', () => {
  const input = {
    customerId: CUSTOMER,
    tableSessionId: SESSION,
    expectedArrivalAt: '2026-07-05T20:00:00.000Z',
  };

  it('caminho feliz: 1 create → 1 request pending + 1 chain + 1 emit', async () => {
    const { service, emitted, countPendingRequests, countChains } = makeService();
    const r1 = await service.create(input, SLUG);
    expect(r1.status).toBe('pending');
    expect(countPendingRequests()).toBe(1);
    expect(countChains()).toBe(1);
    expect(emitted).toHaveLength(1);
  });

  it('retry (2 creates pro mesmo session+customer) → 1 request + 1 chain (não 2+2)', async () => {
    const { service, emitted, countPendingRequests, countChains } = makeService();
    const r1 = await service.create(input, SLUG);
    const r2 = await service.create(input, SLUG);

    // A 2ª chamada devolve a MESMA request 'pending', sem criar uma 2ª.
    expect(r2.id).toBe(r1.id);
    expect(countPendingRequests()).toBe(1);

    // E — o ponto do bug — NÃO nasce uma 2ª escalation_chain (senão escala
    // sozinha pro gerente = spam).
    expect(countChains()).toBe(1);

    // O host não é re-avisado no retry (só o 1º create emite).
    expect(emitted).toHaveLength(1);
    expect(emitted[0].requestId).toBe(r1.id);
  });

  it('mesmo customer, OUTRA session → é um pedido novo legítimo (1 request + 1 chain cada)', async () => {
    const { service, countPendingRequests, countChains } = makeService();
    await service.create(input, SLUG);
    await service.create(
      { ...input, tableSessionId: 'cccc3333-0000-4000-8000-000000000003' },
      SLUG,
    );
    expect(countPendingRequests()).toBe(2);
    expect(countChains()).toBe(2);
  });
});
