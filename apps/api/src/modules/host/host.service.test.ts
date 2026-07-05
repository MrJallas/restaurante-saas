/**
 * P1-P (re-scan data-integrity): findTableByNumber devia ser DETERMINISTICO.
 *
 * Bug: a query usava `regexp_replace(code, '[^0-9]', '') = $1 LIMIT 1` sem
 * ORDER BY. Como 'M01' e 'D1' colapsam ambos pro numero 1, o LIMIT 1 pegava
 * uma mesa ARBITRARIA sob colisao de digitos — liberate/vip/swap/reserva
 * agiam na mesa errada.
 *
 * Fix congelado aqui:
 *  - code EXATO ("<number>") vence sempre (caminho feliz nao-ambiguo: '7' → 7,
 *    unico 'M12' → 12).
 *  - colisao de digitos (>1 candidato, sem exato) e REJEITADA como
 *    BadRequest 'codigo de mesa ambiguo' em vez de resolvida ao acaso.
 *
 * O helper e privado; testamos atraves de toggleVip (public), que chama
 * findTableByNumber e para logo em seguida (sem sessao ativa → 409), deixando
 * o id resolvido observavel nos params da query de sessao ativa.
 */

import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { AlertsService } from '../alerts/alerts.service';
import type { EventsGateway } from '../websocket/events.gateway';

interface FakeTableCandidate {
  id: string;
  code: string;
}

/**
 * fakeDb roteia só as 2 queries que toggleVip dispara até o ponto de interesse:
 *  1. findTableByNumber  → SELECT id, code FROM tables WHERE ...
 *  2. sessão ativa       → SELECT id FROM table_sessions WHERE table_id = $1 ...
 * A 2ª volta [] de propósito: força o 409 logo após a resolução, deixando o
 * `table_id` resolvido capturado em `activeSessionParams`.
 */
function fakeDb(candidates: FakeTableCandidate[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let activeSessionParams: unknown[] | null = null;

  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });

    // findTableByNumber (nova query: retorna id + code de todos os candidatos)
    if (s.startsWith('SELECT id, code FROM tables WHERE')) {
      const number = params[0] as number;
      const exact = params[1] as string;
      // Emula o WHERE: code = $2 OR digitos(code) = $1, ORDER BY id ASC.
      const matched = candidates
        .filter((c) => {
          const digits = c.code.replace(/[^0-9]/g, '');
          return c.code === exact || (digits !== '' && Number.parseInt(digits, 10) === number);
        })
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return matched;
    }

    // sessão ativa (para logo aqui: sem sessão → 409)
    if (s.startsWith('SELECT id FROM table_sessions WHERE table_id = $1')) {
      activeSessionParams = params;
      return [];
    }

    throw new Error(`fake host: SQL não roteado: ${s}`);
  };

  return {
    calls,
    getActiveSessionParams: () => activeSessionParams,
    conn: { query } as unknown as TenantConnectionProvider,
  };
}

import type { RedisService } from '../../infra/redis/redis.service';

const noopRedis = { del: async () => undefined } as unknown as RedisService;

function makeService(conn: TenantConnectionProvider, redis: RedisService = noopRedis) {
  return new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
    redis,
  );
}

const VIP_BODY = { flag: true } as const;

describe('HostService.findTableByNumber — resolução determinística (P1-P)', () => {
  it('code numérico exato "7" resolve o id da mesa 7 (caminho feliz não-ambíguo congelado)', async () => {
    const db = fakeDb([
      { id: 'table-aaa', code: '7' },
      { id: 'table-bbb', code: '12' },
    ]);
    // toggleVip resolve a mesa e para no 409 (sem sessão ativa).
    await expect(makeService(db.conn).toggleVip(7, { ...VIP_BODY }, 'slug')).rejects.toBeInstanceOf(
      HttpException,
    );
    // Provou que resolveu para a mesa 7 (e não a 12): o table_id na query de
    // sessão ativa é o id da mesa cujo code === '7'.
    expect(db.getActiveSessionParams()).toEqual(['table-aaa']);
  });

  it('único match por dígito ("M12" → 12) resolve sem ambiguidade', async () => {
    const db = fakeDb([
      { id: 'table-m12', code: 'M12' },
      { id: 'table-other', code: '5' },
    ]);
    await expect(
      makeService(db.conn).toggleVip(12, { ...VIP_BODY }, 'slug'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(db.getActiveSessionParams()).toEqual(['table-m12']);
  });

  it('code exato vence o match-por-dígito colidente ("1" ganha de "M01"/"D1")', async () => {
    const db = fakeDb([
      { id: 'table-m01', code: 'M01' },
      { id: 'table-d1', code: 'D1' },
      { id: 'table-plain-1', code: '1' },
    ]);
    await expect(makeService(db.conn).toggleVip(1, { ...VIP_BODY }, 'slug')).rejects.toBeInstanceOf(
      HttpException,
    );
    // Determinístico: o code exato "1" vence, nunca 'M01'/'D1' arbitrário.
    expect(db.getActiveSessionParams()).toEqual(['table-plain-1']);
  });

  it('colisão de dígitos SEM exato ("M01" + "D1" → 1) é REJEITADA como ambígua (não resolve mesa arbitrária)', async () => {
    const db = fakeDb([
      { id: 'table-m01', code: 'M01' },
      { id: 'table-d1', code: 'D1' },
    ]);
    await expect(makeService(db.conn).toggleVip(1, { ...VIP_BODY }, 'slug')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(makeService(db.conn).toggleVip(1, { ...VIP_BODY }, 'slug')).rejects.toThrow(
      /ambiguo/i,
    );
    // Rejeitou ANTES de tocar sessão — nenhuma mesa foi escolhida ao acaso.
    expect(db.getActiveSessionParams()).toBeNull();
  });

  it('nenhum match → NotFound (mesa inexistente), não ambíguo', async () => {
    const db = fakeDb([{ id: 'table-aaa', code: '7' }]);
    await expect(
      makeService(db.conn).toggleVip(99, { ...VIP_BODY }, 'slug'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.getActiveSessionParams()).toBeNull();
  });
});

/**
 * P1-W (re-scan): `listTables` precisa EXPOR o cliente host da sessão ativa
 * (`table_sessions.host_customer_id` + `customers.name`) pra que o deep-link
 * `/manager/mesa/[n]` propague `customerId` pro "Contactar cliente" da
 * `ScreenManagerTableMenu`. Sem isso o botão fica sempre disabled (dado
 * existe no backend, só não vinha no payload).
 */
describe('HostService.listTables — expõe cliente host da sessão ativa (P1-W)', () => {
  function listTablesDb(rows: unknown[]) {
    const conn = {
      query: async (sql: string) => {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.startsWith('SELECT t.id,')) return rows;
        throw new Error(`fake host: SQL não roteado: ${s}`);
      },
    } as unknown as TenantConnectionProvider;
    return makeService(conn);
  }

  it('mesa ocupada com host identificado → customer_id + customer_name no DTO', async () => {
    const svc = listTablesDb([
      {
        id: 'table-1',
        number: 7,
        capacity: 4,
        zone_name: 'Salão',
        active_session_id: 'sess-1',
        active_session_started_at: '2026-07-04T12:00:00Z',
        participant_count: 2,
        staff_party_override: null,
        staff_note: null,
        has_vip: false,
        host_customer_id: 'cust-42',
        host_customer_name: 'Ana',
        open_release_id: null,
        open_release_expires_at: null,
      },
    ]);
    const [table] = await svc.listTables();
    expect(table.customer_id).toBe('cust-42');
    expect(table.customer_name).toBe('Ana');
  });

  it('mesa ocupada SEM host identificado (host_customer_id null) → customer_id null', async () => {
    const svc = listTablesDb([
      {
        id: 'table-2',
        number: 8,
        capacity: 4,
        zone_name: 'Salão',
        active_session_id: 'sess-2',
        active_session_started_at: '2026-07-04T12:00:00Z',
        participant_count: 1,
        staff_party_override: null,
        staff_note: null,
        has_vip: false,
        host_customer_id: null,
        host_customer_name: null,
        open_release_id: null,
        open_release_expires_at: null,
      },
    ]);
    const [table] = await svc.listTables();
    expect(table.customer_id).toBeNull();
    expect(table.customer_name).toBeNull();
  });

  it('mesa livre (sem sessão) → customer_id null', async () => {
    const svc = listTablesDb([
      {
        id: 'table-3',
        number: 9,
        capacity: 2,
        zone_name: 'Varanda',
        active_session_id: null,
        active_session_started_at: null,
        participant_count: null,
        staff_party_override: null,
        staff_note: null,
        has_vip: null,
        host_customer_id: null,
        host_customer_name: null,
        open_release_id: null,
        open_release_expires_at: null,
      },
    ]);
    const [table] = await svc.listTables();
    expect(table.status).toBe('livre');
    expect(table.customer_id).toBeNull();
    expect(table.customer_name).toBeNull();
  });
});

/**
 * P1-O (re-scan data-integrity): completar um swap NÃO pode deixar 2 sessões
 * ativas na mesma mesa.
 *
 * Bug: o complete fazia `UPDATE table_sessions SET table_id = <destino> WHERE
 * id = <origem>` sem guard. O destino-livre só era checado na criação do swap;
 * entre criar e completar, o cliente escaneava a mesa destino e abria S2 ativa
 * nela. O move deixava S1 (origem movida) + S2 ativas na MESMA mesa.
 *
 * Fix congelado aqui: o complete roda numa transação que RE-CONFIRMA o destino
 * livre e move só a sessão que AINDA está ativa. Destino ocupou no meio →
 * BadRequest, rollback, NENHUM move (o swap fica in_progress, sem 2ª ativa).
 */

interface SwapFakeOptions {
  // Se true, a re-checagem do destino (dentro da tx) acha uma sessão ativa —
  // simula o cliente que escaneou a mesa destino entre criar e completar.
  destinationOccupiedAtComplete?: boolean;
  // Se true, o UPDATE guardado (WHERE id=... AND status='active') não casa
  // nenhuma linha — a sessão de origem já não está mais ativa.
  originNoLongerActive?: boolean;
}

/**
 * fakeSwapDb roteia as queries de updateSwapRequest(id, {status:'completed'}):
 *  1. SELECT sr.id ... FROM table_swap_requests → existing (in_progress)
 *  2. transaction(cb) → executa cb com um tx que roteia:
 *     a. UPDATE table_swap_requests SET status='completed' ...
 *     b. SELECT id FROM tables WHERE id = $1 FOR UPDATE (lock do destino)
 *     c. SELECT id FROM table_sessions WHERE table_id=$1 AND status='active' (re-check)
 *     d. UPDATE table_sessions ... WHERE id=$1 AND status='active' RETURNING id (move guardado)
 *  3. SELECT sr.id ... (refetch para o DTO)
 * Grava se o move (2d) chegou a ser executado e com quais params, pra provar
 * que sob destino-ocupado NENHUMA 2ª sessão ativa é criada.
 */
function fakeSwapDb(opts: SwapFakeOptions = {}) {
  const EXISTING = {
    id: 'swap-1',
    table_session_id: 'sess-origin',
    from_table_id: 'table-from',
    to_table_id: 'table-to',
    status: 'in_progress',
    reason: null,
    created_at: '2026-07-04T10:00:00.000Z',
    completed_at: null,
    cancelled_at: null,
    from_table_number: 5,
    to_table_number: 9,
  };

  let moveExecuted = false;
  let moveParams: unknown[] | null = null;
  let swapMarkedCompleted = false;

  const route = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT sr.id')) {
      // existing + refetch. No refetch (após move ok) devolve status completed.
      return [{ ...EXISTING, status: swapMarkedCompleted ? 'completed' : EXISTING.status }];
    }
    if (s.startsWith('UPDATE table_swap_requests SET')) {
      swapMarkedCompleted = true;
      return [];
    }
    if (s.startsWith('SELECT id FROM tables WHERE id = $1 FOR UPDATE')) {
      return [{ id: params[0] }];
    }
    if (s.startsWith('SELECT id FROM table_sessions')) {
      // Re-check do destino dentro da tx.
      return opts.destinationOccupiedAtComplete ? [{ id: 'sess-intruder' }] : [];
    }
    if (s.startsWith('UPDATE table_sessions')) {
      moveExecuted = true;
      moveParams = params;
      // Guard WHERE id=... AND status='active' → 0 linhas se origem inativa.
      // pg via TypeORM devolve UPDATE...RETURNING como TUPLA [rows, rowCount]
      // (não flat) — o fake tem que imitar o driver, senão o teste mascara o
      // bug da tupla (moved.length===2 sempre). O código deve passar por
      // unwrapRows pra ler as linhas de verdade.
      return opts.originNoLongerActive ? [[], 0] : [[{ id: params[0] }], 1];
    }
    throw new Error(`fake swap: SQL não roteado: ${s}`);
  };

  const conn = {
    query: (sql: string, params?: unknown[]) => route(sql, params),
    transaction: async <T>(work: (tx: { query: typeof route }) => Promise<T>): Promise<T> => {
      // Emula commit/rollback: se o work lança, propaga (rollback) sem estado
      // parcial visível — o fake não persiste nada entre queries além dos flags.
      return work({ query: route });
    },
  } as unknown as TenantConnectionProvider;

  return {
    conn,
    wasMoveExecuted: () => moveExecuted,
    getMoveParams: () => moveParams,
    wasSwapMarkedCompleted: () => swapMarkedCompleted,
  };
}

describe('HostService.updateSwapRequest — complete não duplica sessão ativa (P1-O)', () => {
  it('destino livre → move OK: sessão de origem vai pra mesa destino (caminho feliz congelado)', async () => {
    const db = fakeSwapDb();
    const dto = await makeService(db.conn).updateSwapRequest(
      'swap-1',
      { status: 'completed' },
      'slug',
    );
    expect(dto.status).toBe('completed');
    // O move rodou com guard: [sessionId, toTableId].
    expect(db.wasMoveExecuted()).toBe(true);
    expect(db.getMoveParams()).toEqual(['sess-origin', 'table-to']);
  });

  it('destino ocupou entre criar/completar → rejeita BadRequest e NÃO executa o move (sem 2ª ativa)', async () => {
    const db = fakeSwapDb({ destinationOccupiedAtComplete: true });
    await expect(
      makeService(db.conn).updateSwapRequest('swap-1', { status: 'completed' }, 'slug'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Prova P1-O: nenhum UPDATE table_sessions rodou → destino não ganhou 2ª ativa.
    expect(db.wasMoveExecuted()).toBe(false);
  });

  it('sessão de origem já não está ativa → rejeita BadRequest (move guardado casa 0 linhas)', async () => {
    const db = fakeSwapDb({ originNoLongerActive: true });
    await expect(
      makeService(db.conn).updateSwapRequest('swap-1', { status: 'completed' }, 'slug'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * P1 retry-safety (re-scan #8): `requestAssist` NÃO pode gerar N alertas
 * 'host_assist_table' idênticos no inbox da recepção sob double-tap / retry.
 *
 * Fix congelado aqui: requestAssist repassa `tableSessionId` pra o
 * `alerts.create`, que faz `ON CONFLICT DO NOTHING` contra o índice único
 * parcial da migration 069 (1 ativo por sessão) e, em conflito, REUSA o alerta
 * ativo. Prova de que a sessão é propagada + de que 2 chamadas convergem num
 * único alerta ativo, e de que o WS `host.assist_requested` continua emitindo.
 */
describe('HostService.requestAssist — idempotente por sessão (P1 retry-safety)', () => {
  interface FakeAlert {
    id: string;
    kind: string;
    tableSessionId: string | null;
  }

  /**
   * fakeAssistDeps: um TenantConnectionProvider que resolve label/code da
   * sessão + um AlertsService fake que emula o dedup do índice parcial (1
   * alerta host_assist ativo por sessão; retry devolve o mesmo) e um
   * EventsGateway fake que conta as emissões.
   */
  function makeAssistService() {
    const conn = {
      query: async (sql: string) => {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.startsWith('SELECT t.label, t.code')) {
          return [{ label: 'Mesa 7', code: '7' }];
        }
        throw new Error(`fake assist: SQL não roteado: ${s}`);
      },
      getTenantSlug: () => 'acme',
    } as unknown as TenantConnectionProvider;

    const activeBySession = new Map<string, FakeAlert>();
    const createCalls: Array<{ kind: string; tableSessionId: string | undefined }> = [];
    let seq = 0;
    const alerts = {
      create: async (data: { kind: string; tableSessionId?: string }) => {
        createCalls.push({ kind: data.kind, tableSessionId: data.tableSessionId });
        const sid = data.tableSessionId ?? null;
        // Emula o ON CONFLICT DO NOTHING + re-fetch: se já há ativo pra a
        // sessão, devolve o MESMO alerta (retry reusa).
        if (sid && activeBySession.has(sid)) {
          return activeBySession.get(sid) as unknown as Record<string, unknown>;
        }
        const alert: FakeAlert = { id: `alert-${++seq}`, kind: data.kind, tableSessionId: sid };
        if (sid) activeBySession.set(sid, alert);
        return alert as unknown as Record<string, unknown>;
      },
    } as unknown as AlertsService;

    let assistEmits = 0;
    const events = {
      emitHostAssistRequested: () => {
        assistEmits += 1;
      },
    } as unknown as EventsGateway;

    const service = new HostService(
      conn,
      new HostWaitlistService(conn),
      new HostInboxService(conn),
      new HostReservationsService(conn),
      noopRedis,
      events,
      alerts,
    );

    return {
      service,
      getCreateCalls: () => createCalls,
      getActiveCount: () => activeBySession.size,
      getAssistEmits: () => assistEmits,
    };
  }

  it('repassa tableSessionId pro alerts.create (habilita o dedup do índice 069)', async () => {
    const t = makeAssistService();
    await t.service.requestAssist('sess-7', 'Ajuda com junção de mesas');
    const [call] = t.getCreateCalls();
    expect(call.kind).toBe('host_assist_table');
    expect(call.tableSessionId).toBe('sess-7');
  });

  it('2x requestAssist pra a MESMA sessão → 1 alerta ativo (retry reusa, não spamma)', async () => {
    const t = makeAssistService();
    await t.service.requestAssist('sess-7', 'Ajuda');
    await t.service.requestAssist('sess-7', 'Ajuda'); // double-tap / retry

    // 2 tentativas de create, mas o dedup do índice mantém 1 ativo pra a sessão.
    expect(t.getCreateCalls()).toHaveLength(2);
    expect(t.getActiveCount()).toBe(1);
  });
});

/**
 * A04: fechar/liberar a mesa tem que INVALIDAR a chave Redis da sessão na
 * hora — sem isso o cookie/x-session-token do cliente seguia válido no TTL
 * de 4h e criava orders/payments numa conta já liquidada.
 */
describe('HostService.liberateTable — invalida a sessão no Redis (A04)', () => {
  const CLOSED_SESSION_ID = 'sess-closed-9';

  function fakeLiberateDb() {
    const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT id, code FROM tables WHERE')) {
        return [{ id: 'table-9', code: '9' }];
      }
      if (s.startsWith("SELECT id FROM table_sessions WHERE table_id = $1 AND status = 'active'")) {
        return [{ id: CLOSED_SESSION_ID }];
      }
      if (s.startsWith('UPDATE table_sessions SET status = \'closed\'') || s.includes("SET status = 'closed'")) {
        return [{ id: CLOSED_SESSION_ID }];
      }
      if (s.startsWith('INSERT INTO table_qr_releases')) {
        return [{ id: 'release-1', expires_at: '2026-07-05T12:15:00Z' }];
      }
      throw new Error(`fake liberate: SQL não roteado: ${s}`);
    };
    return { query } as unknown as TenantConnectionProvider;
  }

  it('RED: liberateTable(manual) deleta `session:<id>` do Redis', async () => {
    const deleted: string[] = [];
    const redis = {
      del: async (key: string) => {
        deleted.push(key);
      },
    } as unknown as RedisService;

    const service = makeService(fakeLiberateDb(), redis);
    await service.liberateTable(9, { mode: 'manual_paid' }, 'slug');

    expect(deleted).toContain(`session:${CLOSED_SESSION_ID}`);
  });
});
