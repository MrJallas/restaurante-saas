import { ShiftsService } from './shifts.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const WAITER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';

describe('ShiftsService.requestShiftEnd — owner como aprovador', () => {
  it('encaminha ao owner quando o tenant ainda não possui outro manager', async () => {
    const queries: string[] = [];
    const tenant = {
      query: jest.fn(async (rawSql: string) => {
        const sql = rawSql.replace(/\s+/g, ' ').trim();
        queries.push(sql);
        if (sql.startsWith('SELECT id, name, role FROM staff')) {
          return [{ id: WAITER_ID, name: 'Ana', role: 'waiter' }];
        }
        if (sql.startsWith('SELECT id, thread_id FROM staff_shift_end_requests')) return [];
        if (sql.startsWith('SELECT id, name FROM staff')) {
          return [{ id: OWNER_ID, name: 'Dona Demo' }];
        }
        if (sql.startsWith('INSERT INTO staff_shift_end_requests')) {
          return [[{ id: 'request-1' }], 1];
        }
        if (sql.startsWith('UPDATE staff_shift_end_requests')) return [];
        throw new Error(`SQL não roteado: ${sql}`);
      }),
    } as unknown as TenantConnectionProvider;
    const staffMessages = {
      send: jest.fn(async () => ({ threadId: 'thread-1' })),
    };
    const alerts = { create: jest.fn(async () => undefined) };
    const mongo = { tryDb: jest.fn(() => null) };
    const service = new ShiftsService(
      tenant,
      staffMessages as never,
      alerts as never,
      mongo as never,
    );
    // O log Mongo é best-effort; neutraliza-o para manter o teste focado no
    // roteamento relacional da solicitação.
    jest.spyOn(service as never, 'writeShiftLog').mockResolvedValue(undefined as never);

    const result = await service.requestShiftEnd({ waiterId: WAITER_ID, slug: 'demo' });

    expect(result.managerId).toBe(OWNER_ID);
    expect(queries.find((sql) => sql.includes("role IN ('manager', 'owner')"))).toBeDefined();
    expect(staffMessages.send).toHaveBeenCalled();
  });
});
