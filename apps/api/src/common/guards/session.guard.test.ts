/**
 * A04 (Insecure Design) + multi-tenant — re-scan OWASP 2026-07-05.
 *
 * O token de sessão do cliente é `table_sessions.id` no Redis (`session:<id>`,
 * TTL 4h). Antes o SessionGuard só checava EXISTÊNCIA da chave:
 *
 *  - Sessão FECHADA/liberada com o cookie ainda no TTL criava orders/payments
 *    numa conta já liquidada (dívida-fantasma). RED: token de sessão fechada
 *    (status != 'active' ou closed_at != null) tem que ser rejeitado.
 *  - Token do tenant A era aceito numa rota `/{slugB}/...`. RED: token cujo
 *    `schemaName` diverge do `tenantSchemaName` da URL tem que ser rejeitado.
 *  - GREEN de regressão: sessão ATIVA no tenant certo continua passando.
 */

import { HttpException } from '@nestjs/common';
import { SessionGuard, type SessionData } from './session.guard';
import type { RedisService } from '../../infra/redis/redis.service';
import type { DataSource } from 'typeorm';

const SESSION_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SCHEMA_A = 'restaurant_a';
const SCHEMA_B = 'restaurant_b';

function makeSessionPayload(schemaName = SCHEMA_A): SessionData {
  return {
    sessionId: SESSION_ID,
    tableId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    tableCode: 'M07',
    tableLabel: 'Mesa 7',
    schemaName,
  };
}

/** Redis em memória semeado com a chave da sessão. */
function fakeRedis(payload: SessionData | null): RedisService {
  const store = new Map<string, string>();
  if (payload) store.set(`session:${SESSION_ID}`, JSON.stringify(payload));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
    },
    async del(key: string) {
      store.delete(key);
    },
  } as unknown as RedisService;
}

/**
 * DataSource fake que devolve uma linha de `table_sessions` (status/closed_at)
 * pro SELECT de revalidação. `row=null` = sessão inexistente no banco.
 */
function fakeDataSource(row: { status: string; closed_at: string | null } | null): {
  ds: DataSource;
  queries: Array<{ sql: string; params: unknown[] }>;
} {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const ds = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return row ? [row] : [];
    },
  } as unknown as DataSource;
  return { ds, queries };
}

/** Request com sessão vinda do cookie + schema da URL resolvido pelo middleware. */
function ctx(opts: { urlSchema?: string; token?: string } = {}) {
  const request = {
    cookies: { session_token: opts.token ?? SESSION_ID },
    headers: {} as Record<string, string>,
    tenantSchemaName: opts.urlSchema,
    sessionData: undefined as SessionData | undefined,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
  return { request, context };
}

describe('SessionGuard — A04 revalidação de status', () => {
  it('RED: sessão FECHADA (status=closed) é rejeitada 401 mesmo com chave Redis viva', async () => {
    const redis = fakeRedis(makeSessionPayload());
    const { ds } = fakeDataSource({ status: 'closed', closed_at: '2026-07-05T12:00:00Z' });
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('RED: sessão com closed_at preenchido (status ainda active) é rejeitada 401', async () => {
    const redis = fakeRedis(makeSessionPayload());
    const { ds } = fakeDataSource({ status: 'active', closed_at: '2026-07-05T12:00:00Z' });
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('RED: sessão inexistente no banco (deletada) é rejeitada 401', async () => {
    const redis = fakeRedis(makeSessionPayload());
    const { ds } = fakeDataSource(null);
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('GREEN: sessão ATIVA no tenant certo passa e carimba sessionData', async () => {
    const redis = fakeRedis(makeSessionPayload());
    const { ds, queries } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new SessionGuard(redis, ds);
    const { request, context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sessionData?.sessionId).toBe(SESSION_ID);
    // O SELECT de status roda no schema do token (já cruzado com a URL) e
    // usa o sessionId como parâmetro (PK lookup — 1 query leve).
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain(`"${SCHEMA_A}".table_sessions`);
    expect(queries[0].params).toEqual([SESSION_ID]);
  });
});

describe('SessionGuard — multi-tenant cross-check', () => {
  it('RED: token do tenant A é rejeitado numa rota do tenant B (401) sem tocar o banco', async () => {
    const redis = fakeRedis(makeSessionPayload(SCHEMA_A));
    const { ds, queries } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_B });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    // Cross-check falha antes do SELECT — não gasta query no tenant errado.
    expect(queries).toHaveLength(0);
  });

  it('GREEN: token e URL no MESMO tenant passa (regressão do cross-check)', async () => {
    const redis = fakeRedis(makeSessionPayload(SCHEMA_A));
    const { ds } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('SessionGuard — regressões preservadas', () => {
  it('sem token → 401 (nunca chega no banco)', async () => {
    const redis = fakeRedis(null);
    const { ds } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new SessionGuard(redis, ds);
    const request = { cookies: {}, headers: {}, tenantSchemaName: SCHEMA_A };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('chave Redis ausente (TTL expirou) → 401', async () => {
    const redis = fakeRedis(null);
    const { ds } = fakeDataSource({ status: 'active', closed_at: null });
    const guard = new SessionGuard(redis, ds);
    const { context } = ctx({ urlSchema: SCHEMA_A });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });
});
