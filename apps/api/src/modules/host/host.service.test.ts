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

function makeService(conn: TenantConnectionProvider) {
  return new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
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
      return opts.originNoLongerActive ? [] : [{ id: params[0] }];
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
