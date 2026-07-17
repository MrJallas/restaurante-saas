import { StaffService } from './staff.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';

function setup() {
  const sessionKey = 'staff-session:v1:hash';
  const indexKey = `staff-sessions:v1:demo:${STAFF_ID}`;
  const deleted: string[] = [];
  const sqlCalls: string[] = [];
  const tenant = {
    getTenantSlug: () => 'demo',
    query: jest.fn(async (rawSql: string) => {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      sqlCalls.push(sql);
      if (sql.startsWith('SELECT role FROM staff')) {
        return [{ role: 'waiter' }];
      }
      if (sql.startsWith('UPDATE staff SET')) {
        return [[{ id: STAFF_ID, name: 'Ana', role: 'waiter', is_active: true }], 1];
      }
      if (sql.startsWith('DELETE FROM staff')) return [[{ id: STAFF_ID }], 1];
      return [];
    }),
  } as unknown as TenantConnectionProvider;
  const redis = {
    smembers: jest.fn(async (key: string) => (key === indexKey ? [sessionKey] : [])),
    del: jest.fn(async (key: string) => {
      deleted.push(key);
    }),
  } as unknown as RedisService;
  const events = { disconnectStaff: jest.fn() } as unknown as EventsGateway;
  return {
    service: new StaffService(tenant, redis, events),
    events,
    deleted,
    sqlCalls,
    sessionKey,
    indexKey,
  };
}

describe('StaffService revogação de credenciais', () => {
  it.each([
    ['role', { role: 'host' }],
    ['PIN', { pin: '654321' }],
    ['status', { isActive: false }],
  ] as const)('revoga HTTP/WS imediatamente ao alterar %s', async (_label, patch) => {
    const ctx = setup();
    await ctx.service.update(STAFF_ID, patch);
    expect(ctx.deleted).toEqual(expect.arrayContaining([ctx.sessionKey, ctx.indexKey]));
    expect(ctx.events.disconnectStaff).toHaveBeenCalledWith(STAFF_ID);
  });

  it('marca PIN administrativo como temporário', async () => {
    const ctx = setup();
    await ctx.service.update(STAFF_ID, { pin: '654321' });
    expect(ctx.sqlCalls.find((sql) => sql.startsWith('UPDATE staff SET'))).toContain(
      'must_change_pin = true',
    );
  });

  it('revoga sessões e sockets ao excluir staff', async () => {
    const ctx = setup();
    await ctx.service.delete(STAFF_ID);
    expect(ctx.deleted).toEqual(expect.arrayContaining([ctx.sessionKey, ctx.indexKey]));
    expect(ctx.events.disconnectStaff).toHaveBeenCalledWith(STAFF_ID);
  });
});
