/**
 * CHARACTERIZATION (fase framework, fatia table-merge): congela o
 * comportamento ATUAL da máquina de consentimento dual do approve/reject
 * ANTES da extração pra `merge-consent-state-machine.ts` (módulo puro,
 * padrão orders/order-state-machine.ts).
 *
 * NÃO é bugfix — bugs conhecidos do table-merge ("não" auto-rejeita,
 * cooldown direcional F-1) ficam congelados como estão; correção é fatia
 * separada.
 *
 * O fake emula a semântica do UPDATE com COALESCE/CASE (~L528-550 do
 * service) de forma fiel: o SQL real interpola `now()` OU o nome da
 * própria coluna no stamp de cada lado, e o status só flipa pra
 * 'approved' quando os DOIS timestamps ficam non-NULL. O clock do fake
 * avança a cada UPDATE — se o COALESCE não preservasse o timestamp
 * original num re-approve, o teste (d) quebraria.
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { TableMergeService } from './table-merge.service';
import { MergeTargetResolver } from './merge-target-resolver';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const REQ = 'dddd4444-0000-4000-8000-000000000004';
const SOURCE = 'aaaa1111-0000-4000-8000-000000000001';
const TARGET = 'bbbb2222-0000-4000-8000-000000000002';
const HOST_A = 'eeee5555-0000-4000-8000-00000000000a';
const HOST_B = 'ffff6666-0000-4000-8000-00000000000b';
const STRANGER = '99997777-0000-4000-8000-0000000000ff';

function fakeConsentDb() {
  let clock = 0;
  /** now() do fake — avança a cada UPDATE pra flagrar overwrite indevido. */
  const tick = () => new Date(Date.UTC(2026, 6, 4, 0, 0, ++clock)).toISOString();

  const request: Record<string, unknown> = {
    id: REQ,
    source_table_session_id: SOURCE,
    target_table_session_id: TARGET,
    requesting_customer_id: HOST_A,
    target_customer_id: HOST_B,
    decided_by_customer_id: null,
    status: 'pending',
    message: null,
    ttl_expires_at: '2099-01-01T00:00:00.000Z',
    approved_by_a_at: null,
    approved_by_b_at: null,
    decided_at: null,
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
  };

  const enrich = () => ({
    ...request,
    origin_table_number: 5,
    target_table_number: 7,
    origin_host_name: 'Ana',
    target_host_name: 'Bruno',
    origin_party_size: 2,
    target_party_size: 3,
  });

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // expireOverdueRequests — ttl em 2099, nada expira.
    if (s.startsWith("UPDATE table_merge_requests SET status = 'expired'")) {
      return [];
    }

    // approve: resolução de lado (src_host/tgt_host via host_customer_id).
    if (s.startsWith('SELECT mr.id, mr.source_table_session_id, mr.target_table_session_id')) {
      if (params[0] !== request.id) return [];
      return [
        {
          id: REQ,
          source_table_session_id: SOURCE,
          target_table_session_id: TARGET,
          src_host: HOST_A,
          tgt_host: HOST_B,
        },
      ];
    }

    // reject: resolução de lado (mesmo wiring, SELECT enxuto).
    if (s.startsWith('SELECT src.host_customer_id AS src_host')) {
      if (params[0] !== request.id) return [];
      return [{ src_host: HOST_A, tgt_host: HOST_B }];
    }

    // approve: UPDATE atômico com COALESCE/CASE. O service interpola
    // `now()` no lado do approver e o nome da coluna no outro lado.
    if (s.startsWith('UPDATE table_merge_requests SET approved_by_a_at = COALESCE(')) {
      const aIsNow = s.includes('approved_by_a_at = COALESCE(approved_by_a_at, now())');
      const bIsNow = s.includes('approved_by_b_at = COALESCE(approved_by_b_at, now())');
      // WHERE id = $2 AND status = 'pending'
      if (params[1] !== request.id || request.status !== 'pending') return [];
      const NOW = tick();
      request.approved_by_a_at = request.approved_by_a_at ?? (aIsNow ? NOW : null);
      request.approved_by_b_at = request.approved_by_b_at ?? (bIsNow ? NOW : null);
      request.decided_by_customer_id = request.decided_by_customer_id ?? params[0];
      const both = request.approved_by_a_at != null && request.approved_by_b_at != null;
      if (both) {
        request.status = 'approved';
        request.decided_at = NOW;
      }
      request.updated_at = NOW;
      return [{ ...request }];
    }

    // reject: UPDATE simples + cooldown na transação.
    if (s.startsWith("UPDATE table_merge_requests SET status = 'rejected'")) {
      // WHERE id = $3 AND status = 'pending'
      if (params[2] !== request.id || request.status !== 'pending') return [];
      const NOW = tick();
      request.status = 'rejected';
      request.decided_at = NOW;
      request.decided_by_customer_id = params[0] ?? request.decided_by_customer_id;
      request.message = params[1] ?? request.message;
      request.updated_at = NOW;
      return [{ ...request }];
    }

    if (s.startsWith('INSERT INTO table_merge_cooldowns')) {
      return [{ id: 'cooldown-1' }];
    }

    // getById (enriquecido com números de mesa/hosts/party size).
    if (s.startsWith('SELECT mr.*,')) {
      if (params[0] !== request.id) return [];
      return [enrich()];
    }

    throw new Error(`fake consent: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return { conn, request };
}

function makeService() {
  const { conn, request } = fakeConsentDb();
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
  return { service, events, request };
}

describe('TableMergeService — characterization do consent dual (approve/reject)', () => {
  it('(a) approve pelo host da ORIGEM: status segue pending, approved_by_a_at estampado, WS side=a', async () => {
    const { service, events } = makeService();

    const result = await service.approve(REQ, HOST_A, 'demo');

    expect(result.status).toBe('pending');
    expect(result.approvedByAAt).not.toBeNull();
    expect(result.approvedByBAt).toBeNull();
    expect(result.decidedAt).toBeNull();

    expect(events.emitTableMergeApproved).toHaveBeenCalledTimes(1);
    const [slug, srcId, tgtId, payload] = events.emitTableMergeApproved.mock.calls[0];
    expect(slug).toBe('demo');
    expect(srcId).toBe(SOURCE);
    expect(tgtId).toBe(TARGET);
    expect(payload.side).toBe('a');
    expect(payload.status).toBe('pending');
  });

  it('(b) approve pelo SEGUNDO host consuma: status approved, decided_at setado, WS side=both', async () => {
    const { service, events } = makeService();

    await service.approve(REQ, HOST_A, 'demo');
    const result = await service.approve(REQ, HOST_B, 'demo');

    expect(result.status).toBe('approved');
    expect(result.approvedByAAt).not.toBeNull();
    expect(result.approvedByBAt).not.toBeNull();
    expect(result.decidedAt).not.toBeNull();

    expect(events.emitTableMergeApproved).toHaveBeenCalledTimes(2);
    const payload = events.emitTableMergeApproved.mock.calls[1][3];
    expect(payload.side).toBe('both');
    expect(payload.status).toBe('approved');
  });

  it('(c) approve/reject por quem não é host de lado nenhum: 403 com a mensagem canônica exata', async () => {
    const { service, events, request } = makeService();

    const approveErr = await service.approve(REQ, STRANGER, 'demo').catch((e) => e);
    expect(approveErr).toBeInstanceOf(HttpException);
    expect((approveErr as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((approveErr as HttpException).getResponse()).toBe(
      'Apenas o host de cada mesa pode aprovar a juncao.',
    );

    const rejectErr = await service.reject(REQ, STRANGER, undefined, 'demo').catch((e) => e);
    expect(rejectErr).toBeInstanceOf(HttpException);
    expect((rejectErr as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((rejectErr as HttpException).getResponse()).toBe(
      'Apenas o host de cada mesa pode rejeitar a juncao.',
    );

    // Nada mudou nem vazou evento.
    expect(request.status).toBe('pending');
    expect(events.emitTableMergeApproved).not.toHaveBeenCalled();
    expect(events.emitTableMergeRejected).not.toHaveBeenCalled();
  });

  it('(d) re-approve do mesmo lado é idempotente: COALESCE preserva o timestamp, sem double-count', async () => {
    const { service, events } = makeService();

    const first = await service.approve(REQ, HOST_A, 'demo');
    const second = await service.approve(REQ, HOST_A, 'demo');

    expect(second.status).toBe('pending');
    // O clock do fake avança a cada UPDATE — timestamp igual prova que o
    // COALESCE preservou o stamp original em vez de sobrescrever.
    expect(second.approvedByAAt).toBe(first.approvedByAAt);
    expect(second.approvedByBAt).toBeNull();
    expect(second.decidedAt).toBeNull();

    const payload = events.emitTableMergeApproved.mock.calls[1][3];
    expect(payload.side).toBe('a');
    expect(payload.status).toBe('pending');
  });

  it('(e) guard de decidedByCustomerId ausente: 400 com as mensagens exatas (divergem entre approve/reject)', async () => {
    const { service } = makeService();

    const approveErr = await service.approve(REQ, undefined, 'demo').catch((e) => e);
    expect(approveErr).toBeInstanceOf(HttpException);
    expect((approveErr as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((approveErr as HttpException).getResponse()).toBe(
      'decidedByCustomerId obrigatorio para identificar o lado da junçao.',
    );

    const rejectErr = await service.reject(REQ, undefined, undefined, 'demo').catch((e) => e);
    expect(rejectErr).toBeInstanceOf(HttpException);
    expect((rejectErr as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((rejectErr as HttpException).getResponse()).toBe(
      'decidedByCustomerId obrigatorio para identificar o host.',
    );
  });

  it('(f) reject pelo host do ALVO: status rejected, WS rejectedBy=b, cooldown emitido', async () => {
    const { service, events, request } = makeService();

    const result = await service.reject(REQ, HOST_B, 'mesa cheia', 'demo');

    expect(result.status).toBe('rejected');
    expect(result.cooldownEndsAt).toBeTruthy();
    expect(request.status).toBe('rejected');

    expect(events.emitTableMergeRejected).toHaveBeenCalledTimes(1);
    const payload = events.emitTableMergeRejected.mock.calls[0][3];
    expect(payload.rejectedBy).toBe('b');
    expect(events.emitMergeCooldownStarted).toHaveBeenCalledTimes(1);
  });
});
