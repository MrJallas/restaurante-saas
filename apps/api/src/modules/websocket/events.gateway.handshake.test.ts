/**
 * P1 da auditoria 2026-07-03: o rate-limit do handshake WS (30/60s por IP)
 * contava TODO handshake — 30+ devices no Wi-Fi do restaurante (mesmo IP
 * atrás do NAT) reconectando pós-deploy travavam a mesa inteira por 60s.
 * E o INCR+EXPIRE não-atômico podia deixar chave sem TTL (lockout eterno).
 *
 * Regras fixadas: (1) contador via incrWithExpiry (Lua atômico já testado);
 * (2) chave escopada por tenant+IP; (3) handshake AUTENTICADO devolve a
 * cota (refund) — só tentativa sem credencial válida consome.
 */

import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const STAFF_KEY = 'staff-key-teste';
const STAFF_ID = '99999999-9999-4999-8999-999999999999';

function fakeRedis() {
  const counters = new Map<string, number>();
  const calls = { incr: 0, incrWithExpiry: 0 };
  const svc = {
    async incr(key: string) {
      calls.incr += 1;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async incrWithExpiry(key: string) {
      calls.incrWithExpiry += 1;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async decr(key: string) {
      const next = (counters.get(key) ?? 0) - 1;
      counters.set(key, next);
      return next;
    },
    async expire() {},
    async get() {
      return null; // sem sessão de customer nos cenários staff/anônimo
    },
    async set() {},
  } as unknown as RedisService;
  return { svc, counters, calls };
}

interface FakeSocket {
  id: string;
  handshake: {
    headers: Record<string, string>;
    auth: Record<string, unknown>;
    address: string;
  };
  data: Record<string, unknown>;
  emit: jest.Mock;
  disconnect: jest.Mock;
  join: jest.Mock;
}

function fakeSocket(opts: {
  ip?: string;
  headers?: Record<string, string>;
  auth?: Record<string, unknown>;
}): FakeSocket {
  return {
    id: `sock-${Math.random().toString(36).slice(2, 8)}`,
    handshake: {
      headers: opts.headers ?? {},
      auth: opts.auth ?? {},
      address: opts.ip ?? '10.0.0.7',
    },
    data: {},
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

function staffHeaders(tenant: string): Record<string, string> {
  return {
    'x-staff-key': STAFF_KEY,
    'x-staff-id': STAFF_ID,
    'x-staff-role': 'waiter',
    'x-tenant-slug': tenant,
  };
}

function makeGateway(redis: RedisService) {
  // 3º arg: extração do EventsEmitterService (2026-07-04) — wiring apenas;
  // os cenários de handshake nunca emitem.
  return new EventsGateway(redis, {} as unknown as DataSource, new EventsEmitterService());
}

function wasRateLimited(socket: FakeSocket): boolean {
  return socket.emit.mock.calls.some(
    ([event, payload]) =>
      event === 'error' && /rate limit/i.test((payload as { message?: string })?.message ?? ''),
  );
}

describe('EventsGateway — rate-limit do handshake', () => {
  const OLD_ENV = process.env.STAFF_API_KEY;
  beforeEach(() => {
    process.env.STAFF_API_KEY = STAFF_KEY;
  });
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD_ENV;
  });

  it('handshakes AUTENTICADOS não consomem a cota (35 reconexões staff no mesmo IP passam)', async () => {
    const { svc } = fakeRedis();
    const gateway = makeGateway(svc);
    for (let i = 0; i < 35; i++) {
      const socket = fakeSocket({ headers: staffHeaders('restaurant_dev') });
      await gateway.handleConnection(socket as never);
      expect(wasRateLimited(socket)).toBe(false);
      expect(socket.data.staffId).toBe(STAFF_ID);
    }
  });

  it('tentativas SEM credencial continuam bloqueadas após 30 no mesmo IP+tenant', async () => {
    const { svc } = fakeRedis();
    const gateway = makeGateway(svc);
    for (let i = 0; i < 30; i++) {
      const socket = fakeSocket({ auth: { tenantSlug: 'restaurant_dev' } });
      await gateway.handleConnection(socket as never);
      expect(wasRateLimited(socket)).toBe(false);
    }
    const bloqueado = fakeSocket({ auth: { tenantSlug: 'restaurant_dev' } });
    await gateway.handleConnection(bloqueado as never);
    expect(wasRateLimited(bloqueado)).toBe(true);
    expect(bloqueado.disconnect).toHaveBeenCalled();
  });

  it('tenantHint e X-Forwarded-For forjados não criam buckets novos', async () => {
    const { svc } = fakeRedis();
    const gateway = makeGateway(svc);
    for (let i = 0; i < 31; i++) {
      const socket = fakeSocket({
        headers: { 'x-forwarded-for': `203.0.113.${i}` },
        auth: { tenantSlug: `tenant_${i}` },
      });
      await gateway.handleConnection(socket as never);
    }
    const bloqueado = fakeSocket({
      headers: { 'x-forwarded-for': '198.51.100.250' },
      auth: { tenantSlug: 'tenant_novo' },
    });
    await gateway.handleConnection(bloqueado as never);
    expect(wasRateLimited(bloqueado)).toBe(true);
  });

  it('contador usa o helper atômico (incrWithExpiry), nunca INCR+EXPIRE separados', async () => {
    // Contrato de atomicidade: o INCR não-atômico deixava chave sem TTL
    // quando o EXPIRE falhava (lockout pra sempre). O incrWithExpiry é
    // Lua atômico e já tem teste próprio.
    const { svc, calls } = fakeRedis();
    const gateway = makeGateway(svc);
    await gateway.handleConnection(fakeSocket({ auth: {} }) as never);
    expect(calls.incrWithExpiry).toBeGreaterThan(0);
    expect(calls.incr).toBe(0);
  });
});
