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
