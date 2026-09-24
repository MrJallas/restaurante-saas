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
 * NOTA (2026-08-31): este arquivo já cobriu também `sweepLateArrivals` e o
 * `LateArrivalService` (P1-T e Resíduos 1 e 2 do re-scan de 2026-07-04). O
 * System B — `late_arrival_requests` + escalada pro staff — foi removido na
 * migration 081, então esses casos saíram junto: não há mais um segundo sweep
 * autocommit concorrendo com o `sweepEscalations`. O CAS de nível continua no
 * `advanceChain` e segue coberto pelo teste de concorrência acima.
 */

import { TtlTickService } from './ttl-tick.service';
import type { DataSource, QueryRunner } from 'typeorm';
import type { EventsGateway } from '../websocket/events.gateway';
import type { SecurityAuditService } from '../security-audit/security-audit.service';

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
    // Kind genérico de propósito: 'scan_verification' é o ÚNICO que faz
    // advanceChain disparar um UPDATE extra na tabela de origem, e este fake
    // não roteia esse SQL. O fixture original usava 'late_arrival', que saiu
    // com o System B (migration 081); 'table_merge' percorre exatamente o mesmo
    // caminho genérico que ele percorria.
    kind: 'table_merge',
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
