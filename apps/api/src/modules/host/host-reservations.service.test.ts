/**
 * CHARACTERIZATION (extração HostReservationsService): congela o
 * comportamento das reservas do host ANTES de mover os métodos pra fora do
 * host.service. Fixa:
 *  - listReservations: shape mapeado (mapReservationRow) + ordem preservada
 *    da query (scheduled_at ASC), when projetado no timezone do restaurante.
 *  - createReservation: parsing de when='HH:MM' → hoje às HH:MM no fuso do
 *    restaurante via PostgreSQL/settings.timezone;
 *    fallback ISO 8601; when inválido estoura 400; lookup de table por
 *    número; params echoados no INSERT.
 *  - updateReservation: transições de status setam status/arrived_at/
 *    cancelled_at; note e table; NotFoundException quando reserva/mesa não
 *    existe.
 *
 * O teste roda contra o HostService (facade pública usada pelo
 * host.controller) — pós-extração o delegate continua cobrindo o serviço
 * novo por transitividade, sem editar as asserções deste arquivo.
 */

import { HttpException, NotFoundException } from '@nestjs/common';
import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const RES = 'rrrrrrr1-0000-4000-8000-000000000001';
const TABLE_ID = 'ttttttt1-0000-4000-8000-000000000001';

interface FakeReservationRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  scheduled_at: string;
  local_time: string;
  table_id: string | null;
  table_number: number | null;
  status: string;
  arrived_at: string | null;
  cancelled_at: string | null;
  note: string | null;
}

function row(over: Partial<FakeReservationRow> = {}): FakeReservationRow {
  return {
    id: RES,
    name: 'Ana',
    party: 4,
    phone: '11999990000',
    scheduled_at: '2026-07-04T19:30:00.000Z',
    local_time: '19:30',
    table_id: null,
    table_number: null,
    status: 'awaited',
    arrived_at: null,
    cancelled_at: null,
    note: null,
    ...over,
  };
}

function fakeDb(
  opts: {
    list?: FakeReservationRow[];
    tableLookup?: { id: string } | null;
    inserted?: FakeReservationRow;
    existing?: { id: string } | null;
    refreshed?: FakeReservationRow;
    localScheduledAt?: string;
  } = {},
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });

    // findTableByNumber
    if (s.startsWith('SELECT id, code FROM tables WHERE')) {
      return opts.tableLookup === undefined ? [] : opts.tableLookup ? [opts.tableLookup] : [];
    }
    // listReservations
    if (s.startsWith('SELECT r.id, r.name, r.party, r.phone, r.scheduled_at,')) {
      // este prefixo cobre a query de refresh do updateReservation também
      if (s.includes('WHERE r.id = $1')) {
        return opts.refreshed ? [opts.refreshed] : [];
      }
      return opts.list ?? [];
    }
    // Conversão HH:MM civil do restaurante -> instante real.
    if (s.startsWith('SELECT ((') && s.endsWith('AS scheduled_at')) {
      return [{ scheduled_at: opts.localScheduledAt ?? '2026-07-04T22:30:00.000Z' }];
    }
    // createReservation INSERT (flat Row[] no pg)
    if (s.startsWith('INSERT INTO reservations')) {
      return [opts.inserted ?? row({ scheduled_at: params[3] as string })];
    }
    // updateReservation existência
    if (s.startsWith('SELECT id FROM reservations WHERE id = $1')) {
      return opts.existing === undefined ? [{ id: RES }] : opts.existing ? [opts.existing] : [];
    }
    // updateReservation UPDATE (tupla [rows, affected] no pg)
    if (s.startsWith('UPDATE reservations SET')) {
      return [[{ id: params[0] }], 1];
    }
    throw new Error(`fake reservations: SQL não roteado: ${s}`);
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

const noopRedis = {
  del: async () => undefined,
} as unknown as import('../../infra/redis/redis.service').RedisService;

function makeService(conn: TenantConnectionProvider) {
  return new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
    noopRedis,
  );
}

describe('Host reservations — characterization', () => {
  describe('listReservations', () => {
    it('preserva a ordem e mapeia when no timezone configurado do restaurante', async () => {
      const first = row({
        id: 'r1',
        name: 'Ana',
        scheduled_at: '2026-07-04T19:30:00.000Z',
        local_time: '16:30',
        table_id: TABLE_ID,
        table_number: 12,
        note: 'janela',
      });
      const second = row({
        id: 'r2',
        name: 'Bruno',
        party: 2,
        phone: null,
        scheduled_at: '2026-07-04T20:45:00.000Z',
        local_time: '17:45',
        status: 'arrived',
      });
      const { calls, conn } = fakeDb({ list: [first, second] });
      const list = await makeService(conn).listReservations();

      const select = calls.find((c) => c.sql.startsWith('SELECT r.id, r.name, r.party'))!;
      expect(select.sql).toContain('FROM reservations r');
      expect(select.sql).toContain('AT TIME ZONE');
      expect(select.sql).toContain('JOIN pg_timezone_names');
      expect(select.sql).not.toMatch(/\bCURRENT_DATE\b/i);
      expect(select.sql).toContain("OR r.status IN ('awaited', 'arrived')");
      expect(select.sql).toContain('ORDER BY r.scheduled_at ASC');

      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: 'r1',
        name: 'Ana',
        party: 4,
        phone: '11999990000',
        when: '16:30',
        table: 12,
        status: 'awaited',
        note: 'janela',
      });
      // phone null → undefined no DTO; table null → table_number null.
      expect(list[1].phone).toBeUndefined();
      expect(list[1].table).toBeNull();
      expect(list[1].when).toBe('17:45');
      expect(list[1].status).toBe('arrived');
    });
  });

  describe('createReservation', () => {
    it("when='HH:MM' usa hoje e o timezone de settings, não o fuso do Node", async () => {
      const expectedIso = '2026-07-04T22:30:00.000Z';
      const { calls, conn } = fakeDb({ localScheduledAt: expectedIso });
      const dto = await makeService(conn).createReservation({
        name: 'Carla',
        party: 3,
        phone: '11888887777',
        when: '19:30',
        note: 'aniversário',
      });

      const localClock = calls.find(
        (c) => c.sql.startsWith('SELECT ((') && c.sql.endsWith('AS scheduled_at'),
      )!;
      expect(localClock.params).toEqual(['19:30']);
      expect(localClock.sql).toContain('JOIN pg_timezone_names');
      expect(localClock.sql).toContain("'America/Sao_Paulo'");

      const insert = calls.find((c) => c.sql.startsWith('INSERT INTO reservations'))!;
      expect(insert.params[0]).toBe('Carla');
      expect(insert.params[1]).toBe(3);
      expect(insert.params[2]).toBe('11888887777');
      expect(insert.params[3]).toBe(expectedIso);
      expect(insert.params[4]).toBeNull(); // sem table
      expect(insert.params[5]).toBe('aniversário');

      // O RETURNING projeta o horário local; o fake devolve o mesmo contrato.
      expect(dto.when).toBe('19:30');
      expect(dto.name).toBe('Ana'); // eco default do fake (não faz parte do congelamento de parsing)
    });

    it('when ISO 8601 é parseado direto', async () => {
      const iso = '2026-07-04T21:15:00.000Z';
      const { calls, conn } = fakeDb();
      await makeService(conn).createReservation({ name: 'Duda', party: 2, when: iso });
      const insert = calls.find((c) => c.sql.startsWith('INSERT INTO reservations'))!;
      expect(insert.params[3]).toBe(new Date(iso).toISOString());
    });

    it('when inválido estoura HttpException 400', async () => {
      const { conn } = fakeDb();
      await expect(
        makeService(conn).createReservation({ name: 'X', party: 2, when: 'não-é-data' }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('HH:MM fora do relógio civil estoura 400 antes de consultar o banco', async () => {
      const { calls, conn } = fakeDb();
      await expect(
        makeService(conn).createReservation({ name: 'X', party: 2, when: '25:99' }),
      ).rejects.toBeInstanceOf(HttpException);
      expect(calls).toHaveLength(0);
    });

    it('table informada resolve o id via findTableByNumber e vai no INSERT', async () => {
      const { calls, conn } = fakeDb({ tableLookup: { id: TABLE_ID } });
      await makeService(conn).createReservation({
        name: 'Edu',
        party: 5,
        when: '18:00',
        table: 12,
      });
      const lookup = calls.find((c) => c.sql.startsWith('SELECT id, code FROM tables WHERE'))!;
      // P1-P: agora passa [number, String(number)] (dígito + code exato).
      expect(lookup.params).toEqual([12, '12']);
      const insert = calls.find((c) => c.sql.startsWith('INSERT INTO reservations'))!;
      expect(insert.params[4]).toBe(TABLE_ID);
    });

    it('table inexistente estoura NotFoundException', async () => {
      const { conn } = fakeDb({ tableLookup: null });
      await expect(
        makeService(conn).createReservation({ name: 'Y', party: 2, when: '18:00', table: 999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateReservation', () => {
    it("status='arrived' seta status + arrived_at e devolve o DTO refrescado", async () => {
      const refreshed = row({ status: 'arrived', arrived_at: '2026-07-04T19:31:00.000Z' });
      const { calls, conn } = fakeDb({ refreshed });
      const dto = await makeService(conn).updateReservation(RES, { status: 'arrived' });

      const update = calls.find((c) => c.sql.startsWith('UPDATE reservations SET'))!;
      expect(update.sql).toContain('status = $2');
      expect(update.sql).toContain('arrived_at = now()');
      expect(update.params).toEqual([RES, 'arrived']);
      expect(dto.status).toBe('arrived');
    });

    it("status='cancelled' seta cancelled_at", async () => {
      const refreshed = row({ status: 'cancelled', cancelled_at: '2026-07-04T19:31:00.000Z' });
      const { calls, conn } = fakeDb({ refreshed });
      await makeService(conn).updateReservation(RES, { status: 'cancelled' });
      const update = calls.find((c) => c.sql.startsWith('UPDATE reservations SET'))!;
      expect(update.sql).toContain('cancelled_at = now()');
      expect(update.params).toEqual([RES, 'cancelled']);
    });

    it('note e table entram no SET; table resolve via findTableByNumber', async () => {
      const refreshed = row({ table_id: TABLE_ID, table_number: 7, note: 'nova obs' });
      const { calls, conn } = fakeDb({ tableLookup: { id: TABLE_ID }, refreshed });
      const dto = await makeService(conn).updateReservation(RES, { note: 'nova obs', table: 7 });

      const update = calls.find((c) => c.sql.startsWith('UPDATE reservations SET'))!;
      expect(update.sql).toContain('note = $2');
      expect(update.sql).toContain('table_id = $3');
      expect(update.params).toEqual([RES, 'nova obs', TABLE_ID]);
      expect(dto.table).toBe(7);
      expect(dto.note).toBe('nova obs');
    });

    it('reserva inexistente estoura NotFoundException', async () => {
      const { conn } = fakeDb({ existing: null });
      await expect(
        makeService(conn).updateReservation(RES, { status: 'arrived' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('table inexistente no update estoura NotFoundException', async () => {
      const { conn } = fakeDb({ tableLookup: null });
      await expect(makeService(conn).updateReservation(RES, { table: 999 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
