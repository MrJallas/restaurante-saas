import { ForbiddenException, HttpException } from '@nestjs/common';
import type { RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin } from './staff-pin.util';
import { StaffService } from './staff.service';

const OWNER_ID = '91000000-0000-4000-8000-000000000001';

function harness() {
  const query = jest.fn(async (rawSql: string, params: unknown[] = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('SELECT id, name, role') && sql.includes('ORDER BY name ASC')) {
      // Simula o predicado no banco: sem a exclusão explícita, o owner vaza.
      return sql.includes("role <> 'owner'")
        ? []
        : [{ id: OWNER_ID, name: 'Dona Demo', role: 'owner' }];
    }
    if (sql.startsWith('SELECT id, name, role') && sql.includes('FROM staff WHERE id = $1')) {
      return [{ id: OWNER_ID, name: 'Dona Demo', role: 'owner', is_active: true }];
    }
    if (sql.startsWith('SELECT id, role FROM staff WHERE id = $1')) {
      return [{ id: OWNER_ID, role: 'owner' }];
    }
    if (sql.startsWith('SELECT role FROM staff WHERE id = $1 LIMIT 1')) {
      return [{ role: 'owner' }];
    }
    if (sql.startsWith('SELECT pin_hash FROM staff')) {
      return sql.includes("role <> 'owner'") ? [] : [{ pin_hash: hashPin('123456') }];
    }
    throw new Error(`SQL não roteado no teste de owner: ${sql} :: ${JSON.stringify(params)}`);
  });
  const tenant = {
    getTenantSlug: () => 'restaurant_demo',
    query,
  } as unknown as TenantConnectionProvider;
  const redis = {
    get: jest.fn(async () => null),
    del: jest.fn(async () => undefined),
    incr: jest.fn(async () => 1),
    expire: jest.fn(async () => undefined),
    set: jest.fn(async () => undefined),
    smembers: jest.fn(async () => []),
    reserveAttempt: jest.fn(async () => null),
    clearAttempts: jest.fn(async () => undefined),
  } as unknown as RedisService;
  const events = { disconnectStaff: jest.fn() } as unknown as EventsGateway;
  return { service: new StaffService(tenant, redis, events), query, redis, events };
}

async function expectOwnerProtected(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error('esperava OWNER_PROTECTED');
  } catch (err) {
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'OWNER_PROTECTED' });
  }
}

describe('StaffService owner provisioning boundary', () => {
  it('exclui owner do roster inclusive quando role=owner é pedido explicitamente', async () => {
    const { service, query } = harness();

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.list('owner', true)).resolves.toEqual([]);

    const calls = query.mock.calls.map(([sql, params]) => ({
      sql: String(sql).replace(/\s+/g, ' ').trim(),
      params,
    }));
    expect(calls).toHaveLength(2);
    expect(calls.every(({ sql }) => sql.includes("role <> 'owner'"))).toBe(true);
    expect(calls[1]).toMatchObject({ params: ['owner'] });
    expect(calls[1].sql).toContain('role = $1');
    expect(calls[1].sql).toContain('is_active = true');
  });

  it('bloqueia leitura direta e performance do owner antes de consultar KPIs', async () => {
    const first = harness();
    await expectOwnerProtected(first.service.getById(OWNER_ID));
    expect(first.query).toHaveBeenCalledTimes(1);

    const second = harness();
    await expectOwnerProtected(second.service.getPerformance(OWNER_ID, 'today'));
    expect(second.query).toHaveBeenCalledTimes(1);
  });

  it('bloqueia update/delete do owner antes de mutação ou revogação de sessão/socket', async () => {
    const update = harness();
    await expectOwnerProtected(update.service.update(OWNER_ID, { name: 'Conta tomada' }));
    expect(update.query.mock.calls.some(([sql]) => /^UPDATE staff/i.test(String(sql)))).toBe(false);
    expect(update.redis.smembers).not.toHaveBeenCalled();
    expect(update.events.disconnectStaff).not.toHaveBeenCalled();

    const remove = harness();
    await expectOwnerProtected(remove.service.delete(OWNER_ID));
    expect(remove.query.mock.calls.some(([sql]) => /^DELETE FROM staff/i.test(String(sql)))).toBe(
      false,
    );
    expect(remove.redis.smembers).not.toHaveBeenCalled();
    expect(remove.events.disconnectStaff).not.toHaveBeenCalled();
  });

  it('verifyPin legado não autentica owner mesmo com o PIN correto', async () => {
    const { service, query, redis } = harness();

    await expect(service.verifyPin(OWNER_ID, '123456', '198.51.100.7')).resolves.toBe(false);

    const pinSql = String(
      query.mock.calls.find(([sql]) => String(sql).includes('SELECT pin_hash'))?.[0] ?? '',
    ).replace(/\s+/g, ' ');
    expect(pinSql).toContain("role <> 'owner'");
    // A tentativa foi reservada e fica contada como falha; nada zera os baldes.
    expect(redis.reserveAttempt).toHaveBeenCalledTimes(1);
    expect(redis.clearAttempts).not.toHaveBeenCalled();
  });
});
