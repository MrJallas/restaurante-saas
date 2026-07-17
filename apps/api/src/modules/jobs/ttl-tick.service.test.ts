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
 *
 * ─── RESÍDUOS do re-scan de verificação (2026-07-04) ───
 *
 * Resíduo 1 (cross-sweep double-advance no MESMO tick): P1-T fez a chain de
 * late_arrival nascer com ttl == request.ttl. No MESMO tick de 10s, os DOIS
 * sweeps casam a MESMA chain vencida: sweepEscalations (sob withTenantTx +
 * FOR UPDATE) E sweepLateArrivals (que chama advanceChain SEM runner → cai no
 * withTenant autocommit, SEM FOR UPDATE, SEM lock). O FOR UPDATE do
 * sweepEscalations não trava o caminho do sweepLateArrivals (é outra conexão
 * autocommit) → a MESMA chain avança 2× (double-emit) OU pula nível. Fix: CAS
 * de nível no UPDATE do advanceChain (`WHERE level = $fromLevel`) — o perdedor
 * da corrida casa 0 linhas e não re-emite. Prova: um tick com sweepEscalations
 * E sweepLateArrivals sobre a MESMA chain vencida emite advance 1×.
 *
 * Resíduo 2 (chain órfã / zumbi): respond() (host aprova/rejeita) NUNCA setava
 * completed_at na escalation_chains. O sweepEscalations filtra só
 * `completed_at IS NULL AND ttl<now` — depois do host decidir, a chain
 * sobrevivia, vencia e escalava pro gerente como zumbi. Fix: respond() carimba
 * completed_at = now() na chain (espelha o scan-verification.resolve()). Prova:
 * após respond(), a chain tem completed_at e o sweep não a escala.
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
        // Level-CAS: `WHERE ... AND level = $5` (fromLevel). Só casa se a chain
        // ainda está no nível de origem (0). Perdedor da corrida vê level já
        // avançado → 0 linhas afetadas.
        if (chain.level !== 0 || chain.completed_at !== null) return [[], 0];
        chain.level = 1;
        chain.current_assignee_role = 'zone_host';
        return [[], 1];
      }

      if (s.startsWith('UPDATE escalation_chains') && s.includes('completed_at = now()')) {
        if (chain.completed_at !== null || chain.level !== 0) return [[], 0];
        chain.completed_at = '2026-07-04T00:05:00.000Z';
        return [[], 1];
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
    emitLateArrivalApproved: jest.fn(),
    emitLateArrivalRejected: jest.fn(),
  };
}

function makeAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logAudit: jest.fn().mockResolvedValue(undefined),
  } as unknown as SecurityAuditService;
}

function makeRedis() {
  return {
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../infra/redis/redis.service').RedisService;
}

describe('TtlTickService.sweepEscalations — P1-S: sem double-emit sob concorrência', () => {
  it('dois sweeps concorrentes sobre a MESMA chain vencida escalam UMA vez só', async () => {
    const { dataSource } = makeSharedDb();
    const events = makeEvents();
    const service = new TtlTickService(
      dataSource,
      events as unknown as EventsGateway,
      makeAudit(),
      makeRedis(),
    );

    // Acesso ao método privado via cast — testamos a unidade do bug direto.
    const sweep = (
      service as unknown as {
        sweepEscalations: (slug: string, schema: string) => Promise<void>;
      }
    ).sweepEscalations.bind(service);

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

/**
 * Resíduo 1 — cross-sweep double-advance no MESMO tick.
 *
 * Fake DB que modela a corrida REAL entre os DOIS sweeps sobre a MESMA chain
 * vencida de late_arrival:
 *
 *  - `sweepLateArrivals` flipa a request pending→expired (RETURNING traz
 *    escalation_chain_id) e chama advanceChain SEM runner (autocommit,
 *    withTenant) → re-SELECT + UPDATE de advance.
 *  - `sweepEscalations` roda sob withTenantTx (FOR UPDATE SKIP LOCKED) +
 *    advanceChain COM runner/preloaded.
 *
 * A defesa é o CAS de nível no UPDATE do advance: `WHERE id=$1 AND level=$2`.
 * Só UM dos dois caminhos casa `level=0`; o outro (chain já em level=1) casa
 * 0 linhas e advanceChain retorna sem emitir. Sem o CAS, ambos emitiriam.
 */
function makeCrossSweepDb() {
  const chain = {
    id: CHAIN_ID,
    kind: 'late_arrival',
    source_id: 'ssss0000-0000-4000-8000-000000000000',
    level: 0,
    current_assignee_role: 'host',
    current_assignee_staff_id: null as string | null,
    ttl_expires_at: '2026-07-04T00:00:00.000Z',
    completed_at: null as string | null,
  };

  // A request de late-arrival só existe pra ser "expirada" UMA vez — o segundo
  // sweepLateArrivals concorrente encontra pending vazio.
  let lateArrivalPending = true;

  const query = async (sql: string, _params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SET search_path')) return [];

    // sweepTenant: só existem as tabelas que interessam à corrida.
    if (s.startsWith('SELECT table_name')) {
      return [{ table_name: 'late_arrival_requests' }, { table_name: 'escalation_chains' }];
    }

    // sweepLateArrivals: flip pending→expired, RETURNING traz a chain vinculada.
    if (s.startsWith('UPDATE late_arrival_requests') && s.includes("status = 'expired'")) {
      if (!lateArrivalPending) return [[], 0];
      lateArrivalPending = false;
      return [
        [
          {
            id: 'llll1111-0000-4000-8000-000000000001',
            table_session_id: 'tsss2222-0000-4000-8000-000000000002',
            customer_id: 'cccc3333-0000-4000-8000-000000000003',
            escalation_chain_id: CHAIN_ID,
            decided_at: '2026-07-04T00:01:00.000Z',
          },
        ],
        1,
      ];
    }

    // sweepEscalations: FOR UPDATE SKIP LOCKED. Row já avançada (level>0) ou
    // completa não casa mais o filtro.
    if (s.startsWith('SELECT id, kind, source_id') && s.includes('FOR UPDATE SKIP LOCKED')) {
      if (chain.completed_at !== null || chain.level > 0) return [];
      return [{ ...chain }];
    }

    // advanceChain (caminho SEM preloaded, do sweepLateArrivals): re-SELECT.
    if (s.startsWith('SELECT kind, source_id, level')) {
      return [
        {
          kind: chain.kind,
          source_id: chain.source_id,
          level: chain.level,
          current_assignee_staff_id: chain.current_assignee_staff_id,
        },
      ];
    }

    // advanceChain UPDATE de advance COM CAS de nível: só casa se
    // level == fromLevel ($2 é nextLevel, o CAS deve travar no fromLevel).
    if (s.startsWith('UPDATE escalation_chains') && s.includes('level = $2')) {
      // CAS: só o caminho que ainda vê level=0 avança. params[1]=nextLevel(1),
      // então o pré-imagem esperado é fromLevel=0.
      if (chain.level !== 0) return [[], 0];
      chain.level = 1;
      chain.current_assignee_role = 'zone_host';
      return [[], 1];
    }

    if (s.startsWith('UPDATE escalation_chains') && s.includes('completed_at = now()')) {
      if (chain.completed_at !== null) return [[], 0];
      chain.completed_at = '2026-07-04T00:05:00.000Z';
      return [[], 1];
    }

    throw new Error(`fake cross-sweep: SQL não roteado: ${s}`);
  };

  function makeRunner(): QueryRunner {
    return {
      connect: async () => undefined,
      startTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      release: async () => undefined,
      query,
    } as unknown as QueryRunner;
  }

  const dataSource = {
    createQueryRunner: () => makeRunner(),
  } as unknown as DataSource;

  return { dataSource, chain };
}

describe('TtlTickService — Resíduo 1: cross-sweep não avança a mesma chain 2×', () => {
  it('sweepEscalations + sweepLateArrivals sobre a MESMA chain vencida emitem advance 1×', async () => {
    const { dataSource } = makeCrossSweepDb();
    const events = makeEvents();
    const service = new TtlTickService(
      dataSource,
      events as unknown as EventsGateway,
      makeAudit(),
      makeRedis(),
    );

    const svc = service as unknown as {
      sweepEscalations: (slug: string, schema: string) => Promise<void>;
      sweepLateArrivals: (slug: string, schema: string) => Promise<void>;
    };

    // Os dois caminhos batem na mesma chain vencida no mesmo tick.
    await Promise.all([
      svc.sweepEscalations.call(service, 'demo', 'demo_schema'),
      svc.sweepLateArrivals.call(service, 'demo', 'demo_schema'),
    ]);

    // Só UM dos caminhos casa o CAS de nível — advance sai uma vez só.
    expect(events.emitEscalationAdvanced).toHaveBeenCalledTimes(1);
  });
});

/**
 * Resíduo 2 — chain órfã: respond() deve carimbar completed_at na chain
 * vinculada pra ela parar de escalar depois que o host decidiu.
 */
function makeRespondDb(status: 'pending' = 'pending') {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const LATE_ID = 'llll1111-0000-4000-8000-000000000001';

  const baseRow = {
    id: LATE_ID,
    visit_id: null,
    table_session_id: 'tsss2222-0000-4000-8000-000000000002',
    customer_id: 'cccc3333-0000-4000-8000-000000000003',
    requested_at: '2026-07-04T00:00:00.000Z',
    expected_arrival_at: '2026-07-04T00:30:00.000Z',
    status,
    approved_by_staff_id: null,
    approved_by_customer_id: null,
    decided_at: null as string | null,
    escalation_level: 0,
    ttl_expires_at: '2026-07-04T00:01:00.000Z',
    message: null,
    created_at: '2026-07-04T00:00:00.000Z',
    escalation_chain_id: CHAIN_ID,
  };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });

    // respond(): SELECT * do estado atual (pré-flip).
    if (s.startsWith('SELECT * FROM late_arrival_requests')) {
      return [{ ...baseRow }];
    }

    // respond(): UPDATE status flip (RETURNING *).
    if (
      s.startsWith('UPDATE late_arrival_requests') &&
      s.includes('status = $1') &&
      s.includes('decided_at = now()')
    ) {
      return [
        [{ ...baseRow, status: params[0] as string, decided_at: '2026-07-04T00:00:30.000Z' }],
        1,
      ];
    }

    // respond(): fecha a chain vinculada (o fix do resíduo 2).
    if (s.startsWith('UPDATE escalation_chains') && s.includes('completed_at = now()')) {
      return [[], 1];
    }

    // approve(): promoção do participante.
    if (s.startsWith('INSERT INTO session_participants')) {
      return [[], 1];
    }

    // getById / mapRow enrich (não usado no respond, mas defensivo).
    if (s.startsWith('SELECT lar.*,')) {
      return [{ ...baseRow, table_number: 5, requester_name: 'Ana', total_visits: 1 }];
    }

    throw new Error(`fake respond: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(work: (tx: { query: typeof query }) => Promise<T>) => work({ query }),
    getTenantSlug: () => 'demo',
  } as unknown as TenantConnectionProvider;

  return { conn, calls };
}

describe('LateArrivalService.respond — Resíduo 2: chain não vira zumbi', () => {
  it('approve() carimba completed_at na escalation_chain vinculada', async () => {
    const { conn, calls } = makeRespondDb();
    const events = makeEvents();
    const service = new LateArrivalService(conn, events as unknown as EventsGateway);

    await service.approve(
      'llll1111-0000-4000-8000-000000000001',
      { customerId: 'hhhh4444-0000-4000-8000-000000000004' },
      'demo',
    );

    const chainClose = calls.find(
      (c) => c.sql.startsWith('UPDATE escalation_chains') && c.sql.includes('completed_at = now()'),
    );
    expect(chainClose).toBeDefined();
    // A chain fechada é exatamente a vinculada à request.
    expect(chainClose!.params).toContain(CHAIN_ID);
  });

  it('reject() também fecha a chain vinculada', async () => {
    const { conn, calls } = makeRespondDb();
    const events = makeEvents();
    const service = new LateArrivalService(conn, events as unknown as EventsGateway);

    await service.reject(
      'llll1111-0000-4000-8000-000000000001',
      { customerId: 'hhhh4444-0000-4000-8000-000000000004' },
      'motivo',
      'demo',
    );

    const chainClose = calls.find(
      (c) => c.sql.startsWith('UPDATE escalation_chains') && c.sql.includes('completed_at = now()'),
    );
    expect(chainClose).toBeDefined();
    expect(chainClose!.params).toContain(CHAIN_ID);
  });
});

/**
 * A04: o sweep de sessões zumbi (4h sem atividade) fecha a sessão no Postgres
 * E TEM que invalidar a chave Redis correspondente — senão o cliente com o
 * cookie ainda no TTL seguia criando orders/payments numa mesa encerrada.
 */
describe('TtlTickService.sweepStaleSessions — invalida chaves Redis (A04)', () => {
  const ZOMBIE_ID = 'zzzz9999-0000-4000-8000-000000000009';

  function makeSweepDb() {
    const runner = {
      connect: async () => undefined,
      release: async () => undefined,
      query: async (sql: string) => {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.startsWith('SET search_path')) return [];
        if (s.startsWith('UPDATE table_sessions ts') && s.includes("SET status = 'closed'")) {
          // pg devolve UPDATE...RETURNING como tupla [rows, rowCount].
          return [[{ id: ZOMBIE_ID }], 1];
        }
        throw new Error(`fake sweep: SQL não roteado: ${s}`);
      },
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: () => runner,
    } as unknown as DataSource;
    return { dataSource };
  }

  it('RED: sessão zumbi fechada deleta `session:<id>` do Redis', async () => {
    const { dataSource } = makeSweepDb();
    const redis = makeRedis();
    const service = new TtlTickService(
      dataSource,
      makeEvents() as unknown as EventsGateway,
      makeAudit(),
      redis,
    );

    const sweep = (
      service as unknown as {
        sweepStaleSessions: (slug: string, schema: string) => Promise<void>;
      }
    ).sweepStaleSessions.bind(service);

    await sweep('demo', 'demo_schema');

    expect(redis.del).toHaveBeenCalledWith(`session:${ZOMBIE_ID}`);
  });
});
