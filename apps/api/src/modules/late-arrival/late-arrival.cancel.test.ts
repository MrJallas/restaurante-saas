/**
 * P1 (re-scan mega-loop): Customer B preso pra sempre na espera de join.
 *
 * Quando B pede pra entrar numa mesa (POST /:slug/late-arrival-requests) e o
 * host IGNORA, B fica em "Aguardando host da mesa" e o único escape do FE
 * ("Cancelar pedido") só fazia router.back() (no-op). O session/late-arrival
 * pending ficava órfão até o TTL, escalando pro gerente como se fosse timeout.
 *
 * FIX: LateArrivalService.cancel(id, requesterCustomerId) — cancelamento REAL
 * pelo PRÓPRIO solicitante:
 *   - só o requester (customer_id do request) pode cancelar (não o host);
 *   - flip status 'pending' → 'cancelled' + decided_at;
 *   - fecha a escalation_chain vinculada (completed_at) → não escala zumbi;
 *   - emite late_arrival.expired pro room da session → o card do host some.
 *
 * RED→GREEN: cancel() marca cancelled + fecha chain + emite; caller não-requester
 * é rejeitado; cancelar request já-decidido é conflito (idempotência de estado).
 */

import { HttpException } from '@nestjs/common';
import { LateArrivalService } from './late-arrival.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const SESSION = 'aaaa1111-0000-4000-8000-000000000001';
const REQUESTER = 'bbbb2222-0000-4000-8000-000000000002';
const HOST = 'dddd4444-0000-4000-8000-000000000004';
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

function makeService(seed?: Partial<FakeRow>) {
  const now = new Date().toISOString();
  const request: FakeRow = {
    id: 'req-1',
    visit_id: null,
    table_session_id: SESSION,
    customer_id: REQUESTER,
    status: 'pending',
    escalation_chain_id: 'chain-1',
    expected_arrival_at: now,
    ttl_expires_at: new Date(Date.now() + 60_000).toISOString(),
    decided_at: null,
    escalation_level: 0,
    message: null,
    created_at: now,
    requested_at: now,
    approved_by_staff_id: null,
    approved_by_customer_id: null,
    ...seed,
  };
  const chains: Record<string, { id: string; completed_at: string | null }> = {
    'chain-1': { id: 'chain-1', completed_at: null },
  };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // isCallerRequesterOfRequest: SELECT customer_id FROM late_arrival_requests WHERE id = $1
    if (s.startsWith('SELECT customer_id FROM late_arrival_requests')) {
      const [id] = params as string[];
      if (id !== request.id) return [];
      return [{ customer_id: request.customer_id }];
    }

    // respond/cancel prefetch: SELECT * FROM late_arrival_requests WHERE id = $1
    if (s.startsWith('SELECT * FROM late_arrival_requests WHERE id')) {
      const [id] = params as string[];
      return id === request.id ? [{ ...request }] : [];
    }

    // UPDATE late_arrival_requests SET status = 'cancelled' WHERE id=$1 AND
    // status='pending' RETURNING * — status é literal; params = [id, byCustomerId].
    if (s.startsWith('UPDATE late_arrival_requests') && s.includes('RETURNING')) {
      const [id] = params as string[];
      if (id !== request.id || request.status !== 'pending') return [];
      request.status = 'cancelled';
      request.decided_at = new Date().toISOString();
      return [{ ...request }];
    }

    // UPDATE escalation_chains SET completed_at = now() WHERE id = $1 AND completed_at IS NULL
    if (s.startsWith('UPDATE escalation_chains')) {
      const [id] = params as string[];
      const c = chains[id as string];
      if (c && c.completed_at === null) c.completed_at = new Date().toISOString();
      return [];
    }

    // getById after cancel: SELECT lar.*, ...
    if (s.startsWith('SELECT lar.*')) {
      const [id] = params as string[];
      if (id !== request.id) return [];
      return [{ ...request, table_number: 7, requester_name: 'Bea', total_visits: 1 }];
    }

    throw new Error(`fake late-arrival cancel: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(cb: (tx: { query: typeof query }) => Promise<T>) => cb({ query }),
  } as unknown as TenantConnectionProvider;

  const expired: Array<{ requesterCustomerId: string | null; requestId: string }> = [];
  const events = {
    emitLateArrivalExpired: (
      _slug: string,
      requesterCustomerId: string | null,
      payload: { requestId: string },
    ) => {
      expired.push({ requesterCustomerId, requestId: payload.requestId });
    },
  } as unknown as EventsGateway;

  return {
    service: new LateArrivalService(conn, events),
    request,
    chains,
    expired,
  };
}

describe('LateArrivalService.cancel — cancelamento real pelo solicitante (P1 join dead-end)', () => {
  it('requester cancela: status vira cancelled + decided_at carimbado', async () => {
    const { service, request } = makeService();
    const result = await service.cancel('req-1', REQUESTER, SLUG);
    expect(request.status).toBe('cancelled');
    expect(request.decided_at).not.toBeNull();
    expect(result.status).toBe('cancelled');
  });

  it('fecha a escalation_chain vinculada (não escala zumbi pro gerente)', async () => {
    const { service, chains } = makeService();
    await service.cancel('req-1', REQUESTER, SLUG);
    expect(chains['chain-1'].completed_at).not.toBeNull();
  });

  it('emite late_arrival.expired → o card do host some no room da session', async () => {
    const { service, expired } = makeService();
    await service.cancel('req-1', REQUESTER, SLUG);
    expect(expired).toHaveLength(1);
    expect(expired[0].requestId).toBe('req-1');
  });

  it('caller que NÃO é o requester não pode cancelar (403 via isCallerRequesterOfRequest)', async () => {
    const { service } = makeService();
    expect(await service.isCallerRequesterOfRequest('req-1', HOST)).toBe(false);
    expect(await service.isCallerRequesterOfRequest('req-1', REQUESTER)).toBe(true);
  });

  it('cancelar request já decidido é conflito (não re-cancela approved/rejected)', async () => {
    const { service } = makeService({ status: 'approved', decided_at: new Date().toISOString() });
    await expect(service.cancel('req-1', REQUESTER, SLUG)).rejects.toBeInstanceOf(HttpException);
  });
});
