import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';

function socket(data: Record<string, unknown> = {}, auth: Record<string, unknown> = {}) {
  return {
    id: 'socket-security',
    handshake: { headers: {}, auth, address: '10.0.0.10' },
    data: { authReady: Promise.resolve(), ...data },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

function redis(sessionPayload?: Record<string, unknown>) {
  const counters = new Map<string, number>();
  return {
    async incrWithExpiry(key: string) {
      const value = (counters.get(key) ?? 0) + 1;
      counters.set(key, value);
      return value;
    },
    async decr() {
      return 0;
    },
    async get(key: string) {
      if (key === 'session:session-token' && sessionPayload) return JSON.stringify(sessionPayload);
      if (key === `customer_tenant:${CUSTOMER_ID}`) return 'demo';
      return null;
    },
    async set() {},
  } as unknown as RedisService;
}

function gateway(redisService: RedisService) {
  return new EventsGateway(
    redisService,
    { query: jest.fn(async () => []) } as unknown as DataSource,
    new EventsEmitterService(),
  );
}

function errorMessages(client: ReturnType<typeof socket>): string[] {
  return client.emit.mock.calls
    .filter(([event]) => event === 'error')
    .map(([, payload]) => (payload as { message: string }).message);
}

describe('EventsGateway authorization matrix', () => {
  it('não herda customerId individual do payload compartilhado da mesa', async () => {
    const client = socket({}, { sessionToken: 'session-token' });
    const instance = gateway(
      redis({ sessionId: SESSION_ID, customerId: CUSTOMER_ID, schemaName: 'restaurant_demo' }),
    );

    await instance.handleConnection(client as never);
    expect((client.data as Record<string, unknown>).authType).toBe('session');
    expect((client.data as Record<string, unknown>).customerId).toBeUndefined();

    await instance.handleJoinCustomer(client as never, { customerId: CUSTOMER_ID });
    expect(client.join).not.toHaveBeenCalledWith(`customer:${CUSTOMER_ID}`);
    expect(errorMessages(client)).toContain('Customer mismatch');
  });

  it('garçom não pode declarar role manager nem entrar em manager/customer rooms', async () => {
    const client = socket({
      authType: 'staff',
      staffId: STAFF_ID,
      staffRole: 'waiter',
      staffTenantSlug: 'demo',
    });
    const instance = gateway(redis());

    await instance.handleJoinTenant(client as never, { slug: 'demo', role: 'manager' });
    await instance.handleJoinManager(client as never, { managerId: STAFF_ID });
    await instance.handleJoinCustomer(client as never, { customerId: CUSTOMER_ID });

    expect(client.join).not.toHaveBeenCalledWith('tenant:demo:manager');
    expect(client.join).not.toHaveBeenCalledWith(`manager:${STAFF_ID}`);
    expect(client.join).not.toHaveBeenCalledWith(`customer:${CUSTOMER_ID}`);
    expect(errorMessages(client).join(' ')).toMatch(/role mismatch|manager role/i);
  });

  it('cook só entra na room operacional kitchen', async () => {
    const client = socket({
      authType: 'staff',
      staffId: STAFF_ID,
      staffRole: 'cook',
      staffTenantSlug: 'demo',
    });
    const instance = gateway(redis());

    await instance.handleJoinTenant(client as never, { slug: 'demo', role: 'kitchen' });
    expect(client.join).toHaveBeenCalledWith('tenant:demo:kitchen');
  });

  it('manager autenticado entra nas rooms manager e customer do próprio tenant', async () => {
    const client = socket({
      authType: 'staff',
      staffId: STAFF_ID,
      staffRole: 'manager',
      staffTenantSlug: 'demo',
    });
    const instance = gateway(redis());

    await instance.handleJoinManager(client as never, { managerId: STAFF_ID });
    await instance.handleJoinCustomer(client as never, { customerId: CUSTOMER_ID });

    expect(client.join).toHaveBeenCalledWith(`manager:${STAFF_ID}`);
    expect(client.join).toHaveBeenCalledWith(`customer:${CUSTOMER_ID}`);
  });

  it('owner herda as rooms gerenciais sem precisar forjar role no token', async () => {
    const client = socket({
      authType: 'staff',
      staffId: STAFF_ID,
      staffRole: 'owner',
      staffTenantSlug: 'demo',
    });
    const instance = gateway(redis());

    await instance.handleJoinTenant(client as never, { slug: 'demo', role: 'manager' });
    await instance.handleJoinManager(client as never, { managerId: STAFF_ID });
    await instance.handleJoinCustomer(client as never, { customerId: CUSTOMER_ID });

    expect(client.join).toHaveBeenCalledWith('tenant:demo:manager');
    expect(client.join).toHaveBeenCalledWith('tenant:demo');
    expect(client.join).toHaveBeenCalledWith(`manager:${STAFF_ID}`);
    expect(client.join).toHaveBeenCalledWith(`customer:${CUSTOMER_ID}`);
  });
});
