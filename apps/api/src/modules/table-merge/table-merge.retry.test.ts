/**
 * P1 retry-safety (re-scan #8): POST /:slug/table-merge-requests precisa ser
 * IDEMPOTENTE. `createRequest()` fazia INSERT cru de status='pending' checando
 * SÓ cooldown; sem UNIQUE parcial nem guard contra um 'pending' já vivo pro
 * mesmo par direcional (source, target), um re-submit do cliente (timeout de
 * 15s do api() / reconexão → salonSubmitting liberado no finally → 2º POST)
 * criava 2+ requests 'pending', cada um emitindo emitTableMergeCreated → N
 * cards de aprovação pro host de destino, N-1 órfãos até o TTL.
 *
 * Fix: migration 067 (partial UNIQUE em (source, target) WHERE status='pending')
 * + INSERT ... ON CONFLICT DO NOTHING que, em conflito, retorna a request
 * 'pending' já existente.
 *
 * Este fake emula o partial UNIQUE FIELMENTE: mantém um "banco" de rows e, no
 * INSERT com `ON CONFLICT ... WHERE status = 'pending' DO NOTHING`, se já
 * existe um 'pending' pro par (source, target) devolve `[]` (RETURNING vazio,
 * como o pg faz num conflito absorvido). Sem o índice/guard o teste (a) — 2x
 * createRequest → 1 pending — quebraria (viraria 2). O par é DIRECIONAL: B→A
 * NÃO colide com A→B (teste (c)).
 */

import { TableMergeService } from './table-merge.service';
import { MergeTargetResolver } from './merge-target-resolver';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const SOURCE = 'aaaa1111-0000-4000-8000-000000000001';
const TARGET = 'bbbb2222-0000-4000-8000-000000000002';
const REQUESTER = 'cccc3333-0000-4000-8000-000000000003';
const TARGET_HOST = 'ffff6666-0000-4000-8000-00000000000b';

interface Row {
  id: string;
  source_table_session_id: string;
  target_table_session_id: string;
  requesting_customer_id: string;
  target_customer_id: string | null;
  status: string;
  message: string | null;
  ttl_expires_at: string;
  approved_by_a_at: string | null;
  approved_by_b_at: string | null;
  decided_by_customer_id: string | null;
  decided_at: string | null;
  created_at: string;
}

/**
 * Fake do tenantConn com o partial UNIQUE (source, target) WHERE
 * status='pending' aplicado em memória. INSERT/SELECT vêm flat; o UPDATE de
 * expire vem como tupla `[rows, count]` (shape real do pg — ver query-utils).
 */
function fakePgDb() {
  const store: Row[] = [];
  let seq = 0;
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 6, 5, 0, 0, ++clock)).toISOString();

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // expireOverdueRequests — nada expira nestes testes (ttl no futuro).
    if (s.startsWith("UPDATE table_merge_requests SET status = 'expired'")) {
      return [[], 0] as unknown as unknown[];
    }

    // cooldown check — sem cooldown ativo.
    if (s.startsWith('SELECT id, source_table_session_id')) {
      return [];
    }

    // INSERT ... ON CONFLICT (source, target) WHERE status='pending' DO NOTHING.
    if (s.startsWith('INSERT INTO table_merge_requests')) {
      const [src, tgt, reqCust, tgtCust, message, ttl, approvedByA] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string | null,
      ];
      // O partial UNIQUE só existe quando o INSERT declara ON CONFLICT no par
      // com WHERE status='pending' (o índice de 067). Um INSERT cru (código
      // pré-fix) NÃO tem essa cláusula → nunca é deduplicado, e o teste (a)
      // flagra o bug (2 rows pending). Isto mantém o RED honesto.
      const guarded =
        s.includes('ON CONFLICT') &&
        s.includes('source_table_session_id, target_table_session_id') &&
        s.includes("WHERE status = 'pending'");
      const conflict =
        guarded &&
        store.some(
          (r) =>
            r.source_table_session_id === src &&
            r.target_table_session_id === tgt &&
            r.status === 'pending',
        );
      if (conflict) {
        // pg absorve o conflito: RETURNING vem vazio.
        return [];
      }
      const row: Row = {
        id: `req-${++seq}`,
        source_table_session_id: src,
        target_table_session_id: tgt,
        requesting_customer_id: reqCust,
        target_customer_id: tgtCust ?? null,
        status: 'pending',
        message: message ?? null,
        ttl_expires_at: ttl,
        approved_by_a_at: approvedByA ? tick() : null,
        approved_by_b_at: null,
        decided_by_customer_id: null,
        decided_at: null,
        created_at: tick(),
      };
      store.push(row);
      return [{ ...row }];
    }

    // Fallback do createRequest em conflito: pega o 'pending' existente.
    if (s.startsWith('SELECT id FROM table_merge_requests')) {
      const [src, tgt] = params as [string, string];
      const match = store
        .filter(
          (r) =>
            r.source_table_session_id === src &&
            r.target_table_session_id === tgt &&
            r.status === 'pending',
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return match ? [{ id: match.id }] : [];
    }

    // getById enriquecido.
    if (s.startsWith('SELECT mr.*,')) {
      const row = store.find((r) => r.id === params[0]);
      if (!row) return [];
      return [
        {
          ...row,
          origin_table_number: 5,
          target_table_number: 7,
          origin_host_name: 'Ana',
          target_host_name: 'Bruno',
          origin_party_size: 2,
          target_party_size: 3,
        },
      ];
    }

    throw new Error(`fake retry: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return { conn, store };
}

function makeService() {
  const { conn, store } = fakePgDb();
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
  return { service, events, store };
}

const baseInput = {
  sourceTableSessionId: SOURCE,
  targetTableSessionId: TARGET,
  requestingCustomerId: REQUESTER,
  targetCustomerId: TARGET_HOST,
};

describe('TableMergeService.createRequest — retry-safety (idempotência do POST)', () => {
  it('(a) 2x createRequest pro MESMO par cria só 1 request pending (hoje 2+)', async () => {
    const { service, store } = makeService();

    const first = await service.createRequest({ ...baseInput }, 'demo');
    const second = await service.createRequest({ ...baseInput }, 'demo');

    // Mesma request lógica retornada nas duas chamadas.
    expect(first.id).toBe(second.id);
    expect(first.status).toBe('pending');
    expect(second.status).toBe('pending');

    // O banco tem EXATAMENTE 1 pending pro par.
    const pending = store.filter(
      (r) =>
        r.source_table_session_id === SOURCE &&
        r.target_table_session_id === TARGET &&
        r.status === 'pending',
    );
    expect(pending).toHaveLength(1);
  });

  it('(b) só 1 emitTableMergeCreated (o host de destino recebe UM card, não N)', async () => {
    const { service, events } = makeService();

    await service.createRequest({ ...baseInput }, 'demo');
    await service.createRequest({ ...baseInput }, 'demo');
    await service.createRequest({ ...baseInput }, 'demo');

    expect(events.emitTableMergeCreated).toHaveBeenCalledTimes(1);
  });

  it('(c) B→A é request distinta — direção reversa NÃO colide com A→B', async () => {
    const { service, store } = makeService();

    const ab = await service.createRequest({ ...baseInput }, 'demo');
    const ba = await service.createRequest(
      {
        sourceTableSessionId: TARGET,
        targetTableSessionId: SOURCE,
        requestingCustomerId: TARGET_HOST,
        targetCustomerId: REQUESTER,
      },
      'demo',
    );

    expect(ab.id).not.toBe(ba.id);
    const pending = store.filter((r) => r.status === 'pending');
    expect(pending).toHaveLength(2);
  });
});
