/**
 * A04 (Insecure Design) + multi-tenant no StaffOrSessionGuard — o guard das
 * rotas `/{slug}/orders/*`. A repro do A04 é POST /orders numa mesa já fechada:
 * este guard é o que autoriza esse caller-session. A revalidação de status +
 * cross-tenant tem que valer aqui igual ao SessionGuard, SEM afetar o ramo
 * `x-staff-key` (staff continua com o acesso atual).
 */

import { HttpException } from '@nestjs/common';
import { StaffOrSessionGuard } from './staff-or-session.guard';
import type { SessionData } from './session.guard';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const SESSION_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
const SCHEMA_A = 'restaurant_a';
const SCHEMA_B = 'restaurant_b';

function payload(schemaName = SCHEMA_A): SessionData {
  return {
    sessionId: SESSION_ID,
    tableId: 'dddddddd-4444-4444-8444-dddddddddddd',
    tableCode: 'M09',
    tableLabel: 'Mesa 9',
    schemaName,
  };
}

function fakeRedis(seed: SessionData | null): RedisService {
  const store = new Map<string, string>();
  if (seed) store.set(`session:${SESSION_ID}`, JSON.stringify(seed));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
  } as unknown as RedisService;
}

function fakeDataSource(row: { status: string; closed_at: string | null } | null): {
  ds: DataSource;
  count: () => number;
} {
  let queries = 0;
  const ds = {
    async query() {
      queries += 1;
      return row ? [row] : [];
    },
  } as unknown as DataSource;
  return { ds, count: () => queries };
}

function ctx(headers: Record<string, string>, urlSchema?: string) {
  const request = {
    cookies: { session_token: SESSION_ID },
    headers,
    tenantSchemaName: urlSchema,
    actorType: undefined as string | undefined,
    sessionData: undefined as SessionData | undefined,
  };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as never,
  };
}

describe('StaffOrSessionGuard — caller-session revalida (A04 + multi-tenant)', () => {
  const OLD = process.env.STAFF_API_KEY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = OLD;
  });

  it('RED: POST /orders com token de sessão FECHADA é rejeitado 401', async () => {
    const redis = fakeRedis(payload());
    const { ds } = fakeDataSource({ status: 'closed', closed_at: '2026-07-05T00:00:00Z' });
    const guard = new StaffOrSessionGuard(redis, ds);
    const { context } = ctx({}, SCHEMA_A);

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('RED: token do tenant A rejeitado em rota do tenant B (401)', async () => {
    const redis = fakeRedis(payload(SCHEMA_A));
    const { ds } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new StaffOrSessionGuard(redis, ds);
    const { context } = ctx({}, SCHEMA_B);

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('GREEN: sessão ativa no tenant certo passa e carimba actorType=session', async () => {
    const redis = fakeRedis(payload());
    const { ds } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new StaffOrSessionGuard(redis, ds);
    const { request, context } = ctx({}, SCHEMA_A);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actorType).toBe('session');
  });

  it('ramo x-staff-key NÃO passa pela revalidação de sessão (staff intocado)', async () => {
    process.env.STAFF_API_KEY = 'chave-staff-secreta';
    const redis = fakeRedis(null);
    const { ds, count } = fakeDataSource(null);
    const guard = new StaffOrSessionGuard(redis, ds);
    const { request, context } = ctx({ 'x-staff-key': 'chave-staff-secreta' }, SCHEMA_A);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.actorType).toBe('staff');
    // Staff autoriza sem tocar Redis/Postgres de sessão.
    expect(count()).toBe(0);
  });
});
