/**
 * Atribuição garçom→zona (decisão Caleb 2026-07-04): fonte real da carga
 * por garçom. Testes fixam: agrupamento por zona com carga real (mesas
 * ocupadas coagidas do pg-string), idempotência do assign e remoção com
 * histórico (removed_at).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZoneAssignmentsService } from './zone-assignments.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RESTAURANT_LOCAL_DATE_SQL } from '../../common/utils/restaurant-local-time';

const SALAO = 'zone-salao';
const VARANDA = 'zone-varanda';
const ANA = 'staff-ana';

function fakeDb(opts: {
  rows?: Array<Record<string, unknown>>;
  staffActive?: boolean;
  staffRole?: string;
  removedFound?: boolean;
}) {
  const inserts: unknown[][] = [];
  const sqlCalls: string[] = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    sqlCalls.push(s);
    if (s.startsWith('SELECT z.id AS zone_id')) return opts.rows ?? [];
    if (s.startsWith('SELECT id FROM staff')) {
      const role = opts.staffRole ?? 'waiter';
      const roleMatchesSql = !s.includes("role = 'waiter'") || role === 'waiter';
      return opts.staffActive === false || !roleMatchesSql ? [] : [{ id: params[0], role }];
    }
    if (s.startsWith('INSERT INTO waiter_zone_assignments')) {
      inserts.push(params);
      return [{ id: 'assign-1' }];
    }
    if (s.startsWith('UPDATE waiter_zone_assignments')) {
      return opts.removedFound === false ? [] : [{ id: params[0] }];
    }
    throw new Error(`fake zona: SQL não roteado: ${s}`);
  };
  return { inserts, sqlCalls, conn: { query } as unknown as TenantConnectionProvider };
}

describe('ZoneAssignmentsService', () => {
  it('agrupa por zona com carga real coagida (pg manda string)', async () => {
    const { conn } = fakeDb({
      rows: [
        {
          zone_id: SALAO,
          zone_name: 'Salão Principal',
          assignment_id: 'a1',
          staff_id: ANA,
          staff_name: 'Ana Garcom',
          occupied_tables: '3',
          total_tables: '8',
        },
        {
          zone_id: VARANDA,
          zone_name: 'Varanda',
          assignment_id: null,
          staff_id: null,
          staff_name: null,
          occupied_tables: '0',
          total_tables: '4',
        },
      ],
    });
    const res = await new ZoneAssignmentsService(conn).listToday();
    expect(res.zones).toEqual([
      {
        zoneId: SALAO,
        zoneName: 'Salão Principal',
        occupiedTables: 3,
        totalTables: 8,
        waiters: [{ assignmentId: 'a1', staffId: ANA, name: 'Ana Garcom' }],
      },
      {
        zoneId: VARANDA,
        zoneName: 'Varanda',
        occupiedTables: 0,
        totalTables: 4,
        waiters: [], // zona sem garçom aparece VAZIA — nunca nome inventado
      },
    ]);
  });

  it('assign valida staff ativo e insere com quem atribuiu', async () => {
    const { conn, inserts } = fakeDb({});
    const res = await new ZoneAssignmentsService(conn).assign(ANA, SALAO, 'manager-1');
    expect(res.assignmentId).toBe('assign-1');
    expect(inserts[0]).toEqual([ANA, SALAO, 'manager-1']);
  });

  it('assign de staff inativo → 400', async () => {
    const { conn } = fakeDb({ staffActive: false });
    await expect(new ZoneAssignmentsService(conn).assign(ANA, SALAO, 'm')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('assign rejeita papel não-garçom e fixa o predicado role=waiter no banco', async () => {
    const { conn, sqlCalls } = fakeDb({ staffRole: 'manager' });
    await expect(new ZoneAssignmentsService(conn).assign(ANA, SALAO, 'm')).rejects.toThrow(
      BadRequestException,
    );
    expect(sqlCalls[0]).toContain("role = 'waiter'");
    expect(sqlCalls.some((sql) => sql.startsWith('INSERT INTO waiter_zone_assignments'))).toBe(
      false,
    );
  });

  it('lista e grava atribuições pela data civil da timezone persistida em settings', async () => {
    const { conn, sqlCalls } = fakeDb({ rows: [] });
    const service = new ZoneAssignmentsService(conn);
    await service.listToday();
    await service.assign(ANA, SALAO, 'manager-1');

    const localDateSql = RESTAURANT_LOCAL_DATE_SQL.replace(/\s+/g, ' ').trim();
    const listSql = sqlCalls.find((sql) => sql.startsWith('SELECT z.id AS zone_id')) ?? '';
    const insertSql =
      sqlCalls.find((sql) => sql.startsWith('INSERT INTO waiter_zone_assignments')) ?? '';

    expect(listSql).toContain(localDateSql);
    expect(insertSql).toContain(localDateSql);
    expect(listSql).toContain("s.role = 'waiter'");
    expect(localDateSql).toContain('FROM settings cfg');
    expect(localDateSql).toContain('pg_timezone_names');
    expect(localDateSql).toContain('AT TIME ZONE');
  });

  it('remove marca removed_at; já removida → 404', async () => {
    const ok = await new ZoneAssignmentsService(fakeDb({}).conn).remove('a1');
    expect(ok).toEqual({ ok: true });
    await expect(
      new ZoneAssignmentsService(fakeDb({ removedFound: false }).conn).remove('a1'),
    ).rejects.toThrow(NotFoundException);
  });
});
