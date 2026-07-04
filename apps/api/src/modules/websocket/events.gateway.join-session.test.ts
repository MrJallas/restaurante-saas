/**
 * BUG P1 (re-scan, events.gateway.ts:~512): o handler `join:session` do staff
 * comparava `parsed.schemaName` (do payload Redis da sessão = schema Postgres)
 * contra `client.data.staffTenantSlug` (o slug PÚBLICO carimbado no handshake).
 * Iguais só quando `slug == schema_name`. Num tenant onde o slug público difere
 * do schema (modo suportado pelo create-tenant), staff LEGÍTIMO era rejeitado
 * ("Cross-tenant session join blocked") → mesa view do gerente e table view do
 * garçom silenciavam (sem realtime).
 *
 * O `join:customer` (logo ao lado) já resolve o schema CORRETAMENTE via
 * `validateCustomerInTenant`: `SELECT schema_name FROM public.restaurants WHERE
 * slug = $1 AND is_active = true`. Este teste alinha o `join:session` ao mesmo
 * lookup: resolve o slug do staff pra schema_name e compara contra
 * `parsed.schemaName`, mantendo fail-closed (tenant errado segue rejeitado).
 */

import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const STAFF_KEY = 'staff-key-teste';
const STAFF_ID = '99999999-9999-4999-8999-999999999999';

// Tenant cujo slug PÚBLICO difere do schema Postgres — o cenário do bug.
const PUBLIC_SLUG = 'bistro-do-caleb';
const SCHEMA_NAME = 'restaurant_bistro_7f3a';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

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

function fakeSocket(headers: Record<string, string>): FakeSocket {
  return {
    id: `sock-${Math.random().toString(36).slice(2, 8)}`,
    handshake: { headers, auth: {}, address: '10.0.0.7' },
    data: {},
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
  };
}

function staffHeaders(tenantSlug: string): Record<string, string> {
  return {
    'x-staff-key': STAFF_KEY,
    'x-staff-id': STAFF_ID,
    'x-staff-role': 'waiter',
    'x-tenant-slug': tenantSlug,
  };
}

/**
 * Redis fake: `get` devolve o payload da sessão (com schemaName) sob a chave
 * `session:<id>`; o resto é oco. Os counters do rate-limit não importam aqui.
 */
function fakeRedis(sessionPayload: Record<string, unknown> | null) {
  const counters = new Map<string, number>();
  return {
    async incrWithExpiry(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async incr(key: string) {
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
    async get(key: string) {
      if (key === `session:${SESSION_ID}` && sessionPayload) {
        return JSON.stringify(sessionPayload);
      }
      return null;
    },
    async set() {},
  } as unknown as RedisService;
}

/**
 * DataSource fake que responde ao lookup slug→schema_name de public.restaurants
 * (o MESMO lookup que o join:customer/validateCustomerInTenant usa). Devolve
 * `[{ schema_name }]` só pro slug conhecido; slug desconhecido → [].
 */
function fakeDataSource(knownSlug: string, schemaName: string) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const ds = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      if (/FROM public\.restaurants/i.test(sql) && params?.[0] === knownSlug) {
        return [{ schema_name: schemaName }];
      }
      return [];
    },
  } as unknown as DataSource;
  return { ds, calls };
}

function makeGateway(redis: RedisService, dataSource: DataSource) {
  return new EventsGateway(redis, dataSource, new EventsEmitterService());
}

function joinBlocked(socket: FakeSocket): boolean {
  return socket.emit.mock.calls.some(
    ([event, payload]) =>
      event === 'error' &&
      /blocked|mismatch|inválida|corrompido|missing/i.test(
        (payload as { message?: string })?.message ?? '',
      ),
  );
}

function joinedSessionRoom(socket: FakeSocket): boolean {
  return socket.join.mock.calls.some(([room]) => room === `session:${SESSION_ID}`);
}

describe('EventsGateway — join:session isolamento por tenant (slug ≠ schema_name)', () => {
  const OLD_ENV = process.env.STAFF_API_KEY;
  beforeEach(() => {
    process.env.STAFF_API_KEY = STAFF_KEY;
  });
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD_ENV;
  });

  it('ACEITA staff de um tenant com slug≠schema_name na sessão do PRÓPRIO tenant', async () => {
    // Sessão do próprio tenant: schemaName = SCHEMA_NAME.
    const redis = fakeRedis({ sessionId: SESSION_ID, schemaName: SCHEMA_NAME });
    const { ds } = fakeDataSource(PUBLIC_SLUG, SCHEMA_NAME);
    const gateway = makeGateway(redis, ds);

    const socket = fakeSocket(staffHeaders(PUBLIC_SLUG));
    await gateway.handleConnection(socket as never);
    // Sanidade: staff autenticou e o slug carimbado é o PÚBLICO (≠ schema).
    expect(socket.data.staffTenantSlug).toBe(PUBLIC_SLUG);
    expect(socket.data.authType).toBe('staff');

    await gateway.handleJoinSession(socket as never, { sessionId: SESSION_ID });

    expect(joinBlocked(socket)).toBe(false);
    expect(joinedSessionRoom(socket)).toBe(true);
  });

  it('REJEITA staff cuja sessão pertence a OUTRO tenant (schema alheio) — fail-closed', async () => {
    // A sessão pertence a um tenant diferente: schemaName = schema de outro.
    const OTHER_SCHEMA = 'restaurant_outro_9c2b';
    const redis = fakeRedis({ sessionId: SESSION_ID, schemaName: OTHER_SCHEMA });
    // O lookup resolve o slug do staff pro SEU schema (SCHEMA_NAME), que não
    // bate com o schema da sessão (OTHER_SCHEMA).
    const { ds } = fakeDataSource(PUBLIC_SLUG, SCHEMA_NAME);
    const gateway = makeGateway(redis, ds);

    const socket = fakeSocket(staffHeaders(PUBLIC_SLUG));
    await gateway.handleConnection(socket as never);

    await gateway.handleJoinSession(socket as never, { sessionId: SESSION_ID });

    expect(joinBlocked(socket)).toBe(true);
    expect(joinedSessionRoom(socket)).toBe(false);
  });

  it('REJEITA staff cujo slug não resolve pra nenhum schema (tenant inexistente/inativo)', async () => {
    const redis = fakeRedis({ sessionId: SESSION_ID, schemaName: SCHEMA_NAME });
    // knownSlug é OUTRO — o slug do staff não resolve nada → [].
    const { ds } = fakeDataSource('slug-que-nao-e-do-staff', SCHEMA_NAME);
    const gateway = makeGateway(redis, ds);

    const socket = fakeSocket(staffHeaders(PUBLIC_SLUG));
    await gateway.handleConnection(socket as never);

    await gateway.handleJoinSession(socket as never, { sessionId: SESSION_ID });

    expect(joinBlocked(socket)).toBe(true);
    expect(joinedSessionRoom(socket)).toBe(false);
  });
});
