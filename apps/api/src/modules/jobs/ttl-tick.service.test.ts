/**
 * P1-S (re-scan concorrência): sweepEscalations fazia `SELECT ... FOR UPDATE
 * SKIP LOCKED` dentro de um `withTenant` que roda em AUTOCOMMIT (sem BEGIN) e
 * depois libera o QueryRunner. Sem transação envolvendo o SELECT..FOR UPDATE e
 * o UPDATE/emit subsequente (que ainda por cima roda num QueryRunner NOVO), o
 * lock cai no instante em que o SELECT termina. Dois ticks concorrentes pegam
 * a MESMA chain e fazem double-emit da escalação.
 *
 * Fix congelado aqui: o sweep segura UMA transação (BEGIN..COMMIT) pelo SELECT
 * FOR UPDATE SKIP LOCKED + o processamento (advanceChain roda no MESMO runner
 * travado). O lock só cai no commit → o 2º tick concorrente faz SKIP LOCKED da
 * row já travada e não re-processa. Prova: dois sweepEscalations em paralelo
 * emitem escalation.advanced UMA vez só.
 *
 * P1-T (re-scan feature meia-feita): late_arrival_requests.escalation_chain_id
 * tinha 0 writers — a migration 024 promete a coluna/FK mas o LateArrivalService
 * nunca criava a chain, então o branch de escalação no sweep (row.escalation_
 * chain_id) era morto. Fix: create() cria a chain kind='late_arrival' na mesma
 * transação e carimba escalation_chain_id, espelhando o scan-verification.
 */

import { TtlTickService } from './ttl-tick.service';
import { LateArrivalService } from '../late-arrival/late-arrival.service';
import type { DataSource, QueryRunner } from 'typeorm';
import type { EventsGateway } from '../websocket/events.gateway';
import type { SecurityAuditService } from '../security-audit/security-audit.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const CHAIN_ID = 'eeee5555-0000-4000-8000-000000000005';

/**
 * Fake DataSource compartilhado por N QueryRunners concorrentes. Modela a
 * semântica MÍNIMA que o bug depende:
 *
 *  - `escalation_chains` tem UMA chain vencida (level 0, host).
 *  - `SELECT ... FOR UPDATE SKIP LOCKED` só devolve rows que (a) ainda casam o
 *    filtro (completed_at IS NULL) E (b) não estão travadas por outra transação
 *    aberta. Se travadas → SKIP (devolve []).
 *  - O lock pega no SELECT FOR UPDATE e só solta no COMMIT/ROLLBACK/release do
 *    runner que o pegou.
 *  - O UPDATE de advance carimba level/ttl (efetivamente completa o passo).
 *
 * `serialize` força a intercalação clássica da corrida: runner A faz o SELECT
 * FOR UPDATE (pega o lock OU não, conforme a implementação segura o lock), o
 * controle passa pro runner B ANTES de A commitar. Só a versão transacionada
 * (lock segurado até o commit) faz B ver a row travada e pular.
 */
function makeSharedDb() {
  const chain = {
    id: CHAIN_ID,
    kind: 'late_arrival',
    source_id: 'ssss0000-0000-4000-8000-000000000000',
    level: 0,
    current_assignee_role: 'host',
    current_assignee_staff_id: null,
    ttl_expires_at: '2026-07-04T00:00:00.000Z',
    completed_at: null as string | null,
  };

  // Lock global da row: qual runner (por token) detém o lock, se algum.
  let lockHolder: symbol | null = null;

  function makeRunner(): QueryRunner {
    const token = Symbol('runner');
    let inTx = false;
    let holdsLock = false;

    const query = async (sql: string, _params: unknown[] = []): Promise<unknown> => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SET search_path')) return [];

      if (s.startsWith('SELECT id, kind, source_id') && s.includes('FOR UPDATE SKIP LOCKED')) {
        // SKIP LOCKED: se outra tx segura o lock, não devolve a row.
        if (lockHolder !== null && lockHolder !== token) return [];
        // Row já processada (advance carimbou / completou) não casa mais.
        if (chain.completed_at !== null || chain.level > 0) return [];
        // Pega o lock — mas só "segura" de fato se estivermos numa transação.
        // Em autocommit (sem BEGIN) o lock cairia já; modelamos isso soltando
        // o lock ao fim do statement quando NÃO há transação aberta.
        lockHolder = token;
        holdsLock = true;
        if (!inTx) {
          // autocommit: o lock não sobrevive ao statement.
          lockHolder = null;
          holdsLock = false;
        }
        return [{ ...chain }];
      }

      if (s.startsWith('UPDATE escalation_chains') && s.includes('level = $2')) {
        chain.level = 1;
        chain.current_assignee_role = 'zone_host';
        return [[], 0];
      }

      if (s.startsWith('UPDATE escalation_chains') && s.includes('completed_at = now()')) {
        chain.completed_at = '2026-07-04T00:05:00.000Z';
        return [[], 0];
      }

      throw new Error(`fake ttl-tick: SQL não roteado: ${s}`);
    };

    return {
      connect: async () => undefined,
      startTransaction: async () => {
        inTx = true;
      },
      commitTransaction: async () => {
        inTx = false;
        if (holdsLock) {
          lockHolder = null;
          holdsLock = false;
        }
      },
      rollbackTransaction: async () => {
        inTx = false;
        if (holdsLock) {
          lockHolder = null;
          holdsLock = false;
        }
      },
      release: async () => {
        if (holdsLock) {
          lockHolder = null;
          holdsLock = false;
        }
      },
      query,
    } as unknown as QueryRunner;
  }

  const runners: QueryRunner[] = [];
  const dataSource = {
    createQueryRunner: () => {
      const r = makeRunner();
      runners.push(r);
      return r;
    },
  } as unknown as DataSource;

  return { dataSource, chain, runners };
}

function makeEvents() {
  return {
    emitEscalationAdvanced: jest.fn(),
    emitEscalationCompleted: jest.fn(),
    emitScanVerificationEscalated: jest.fn(),
    emitScanVerificationResolved: jest.fn(),
    emitToSession: jest.fn(),
    emitLateArrivalExpired: jest.fn(),
    emitLateArrivalCreated: jest.fn(),
  };
}

function makeAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logAudit: jest.fn().mockResolvedValue(undefined),
  } as unknown as SecurityAuditService;
}

describe('TtlTickService.sweepEscalations — P1-S: sem double-emit sob concorrência', () => {
  it('dois sweeps concorrentes sobre a MESMA chain vencida escalam UMA vez só', async () => {
    const { dataSource } = makeSharedDb();
    const events = makeEvents();
    const service = new TtlTickService(
      dataSource,
      events as unknown as EventsGateway,
      makeAudit(),
    );

    // Acesso ao método privado via cast — testamos a unidade do bug direto.
    const sweep = (service as unknown as {
      sweepEscalations: (slug: string, schema: string) => Promise<void>;
    }).sweepEscalations.bind(service);

    // Dois ticks batendo ao mesmo tempo no mesmo schema.
    await Promise.all([sweep('demo', 'demo_schema'), sweep('demo', 'demo_schema')]);

    // A escalação advanced deve ter sido emitida EXATAMENTE uma vez —
    // sem a transação segurando o FOR UPDATE, ambos os ticks emitiriam.
    expect(events.emitEscalationAdvanced).toHaveBeenCalledTimes(1);
  });
});

/**
 * P1-T: prova que create() do LateArrivalService inicializa a escalation_chain
 * e carimba escalation_chain_id (fechando os 0 writers).
 */
function makeLateArrivalDb() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let capturedChainId: string | null = null;

  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });

    if (s.startsWith('INSERT INTO late_arrival_requests')) {
      return [
        {
          id: 'llll1111-0000-4000-8000-000000000001',
          visit_id: null,
          table_session_id: 'tsss2222-0000-4000-8000-000000000002',
          customer_id: 'cccc3333-0000-4000-8000-000000000003',
          requested_at: '2026-07-04T00:00:00.000Z',
          expected_arrival_at: '2026-07-04T00:30:00.000Z',
          status: 'pending',
          approved_by_staff_id: null,
          approved_by_customer_id: null,
          decided_at: null,
          escalation_level: 0,
          ttl_expires_at: '2026-07-04T00:01:00.000Z',
          message: null,
          created_at: '2026-07-04T00:00:00.000Z',
        },
      ];
    }

    if (s.startsWith('INSERT INTO escalation_chains')) {
      return [{ id: CHAIN_ID }];
    }

    if (s.startsWith('UPDATE late_arrival_requests') && s.includes('escalation_chain_id')) {
      capturedChainId = params[1] as string;
      return [[], 1];
    }

    // getById enrich
    if (s.startsWith('SELECT lar.*,')) {
      return [
        {
          id: 'llll1111-0000-4000-8000-000000000001',
          visit_id: null,
          table_session_id: 'tsss2222-0000-4000-8000-000000000002',
          customer_id: 'cccc3333-0000-4000-8000-000000000003',
          requested_at: '2026-07-04T00:00:00.000Z',
          expected_arrival_at: '2026-07-04T00:30:00.000Z',
          status: 'pending',
          approved_by_staff_id: null,
          approved_by_customer_id: null,
          decided_at: null,
          escalation_level: 0,
          ttl_expires_at: '2026-07-04T00:01:00.000Z',
          message: null,
          created_at: '2026-07-04T00:00:00.000Z',
          table_number: 5,
          requester_name: 'Ana',
          total_visits: 1,
        },
      ];
    }

    throw new Error(`fake late-arrival: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return { conn, calls, capturedChainId: () => capturedChainId };
}

describe('LateArrivalService.create — P1-T: inicializa escalation_chain', () => {
  it('cria a chain kind=late_arrival e carimba escalation_chain_id', async () => {
    const { conn, calls, capturedChainId } = makeLateArrivalDb();
    const events = makeEvents();
    const service = new LateArrivalService(conn, events as unknown as EventsGateway);

    await service.create(
      {
        customerId: 'cccc3333-0000-4000-8000-000000000003',
        tableSessionId: 'tsss2222-0000-4000-8000-000000000002',
      },
      'demo',
    );

    const chainInsert = calls.find((c) => c.sql.startsWith('INSERT INTO escalation_chains'));
    expect(chainInsert).toBeDefined();
    expect(chainInsert!.sql).toContain("'late_arrival'");

    // A chain criada foi linkada de volta na late_arrival_request.
    expect(capturedChainId()).toBe(CHAIN_ID);
  });
});
