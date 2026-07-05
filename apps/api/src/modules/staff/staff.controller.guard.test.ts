/**
 * Regressão de segurança — GET /:slug/staff e GET /:slug/staff/:id devem
 * exigir StaffOnlyGuard (x-staff-key). Antes eram públicas e vazavam o
 * roster completo com PII (cpf/phone/email) + o mapeamento id→role (que é
 * o próprio x-staff-id dos guards de manager/host) pra qualquer um que
 * conhecesse o :slug — que é público na URL do QR/cardápio.
 *
 * Aqui o guard REAL roda (não é overrideGuard) pra provar que a rota está
 * de fato protegida: sem header → 403; com x-staff-key correto → 200.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ZoneAssignmentsService } from './zone-assignments.service';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { issueStaffSessionToken } from '../../common/auth/staff-session-token';
import { DataSource } from 'typeorm';

const STAFF_KEY = 'test-staff-key-regression';

describe('GET /:slug/staff roster — StaffOnlyGuard enforcement (regression)', () => {
  let app: INestApplication;
  let prevKey: string | undefined;
  const list = jest.fn();
  const getById = jest.fn();

  beforeAll(async () => {
    prevKey = process.env.STAFF_API_KEY;
    process.env.STAFF_API_KEY = STAFF_KEY;

    const moduleRef = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        { provide: StaffService, useValue: { list, getById } },
        // RedisService só é usado no verifyPin — stub mínimo pro DI.
        { provide: RedisService, useValue: {} },
        // DataSource: dep nova do StaffOrSessionGuard (revalidação de sessão
        // A04). O roster autentica via x-staff-key, que não passa pela
        // revalidação — stub mínimo pro DI.
        { provide: DataSource, useValue: { query: async () => [] } },
        // Deps das rotas de zone-assignments (2026-07-04) — stubs pro DI;
        // este teste cobre só o guard do roster.
        { provide: ZoneAssignmentsService, useValue: {} },
        { provide: TenantConnectionProvider, useValue: { query: async () => [] } },
        { provide: CallerResolverService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (prevKey === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = prevKey;
    await app.close();
  });

  beforeEach(() => {
    list.mockReset();
    getById.mockReset();
    list.mockResolvedValue([
      { id: 'uuid-1', name: 'Rodrigo', role: 'manager', cpf: '12345678901' },
    ]);
    getById.mockResolvedValue({ id: 'uuid-1', name: 'Rodrigo', role: 'manager' });
  });

  it('list: sem x-staff-key → 403 e o service não é chamado (sem vazamento de PII)', async () => {
    await request(app.getHttpServer()).get('/acme-bistro/staff').expect(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('list: x-staff-key inválido → 403', async () => {
    await request(app.getHttpServer())
      .get('/acme-bistro/staff')
      .set('x-staff-key', 'wrong-key')
      .expect(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('list: x-staff-key correto → 200 (contrato preservado pros consumidores autenticados)', async () => {
    const res = await request(app.getHttpServer())
      .get('/acme-bistro/staff')
      .set('x-staff-key', STAFF_KEY)
      .expect(200);
    expect(res.body.staff).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('getById: sem credencial → 403', async () => {
    await request(app.getHttpServer()).get('/acme-bistro/staff/uuid-1').expect(403);
    expect(getById).not.toHaveBeenCalled();
  });
});

/**
 * IDOR-read (re-scan de convergência #5) — GET /:slug/staff/:id/performance
 * expõe KPIs confidenciais por staff (totalRevenue/faturamento, salesByDay,
 * teamComparison). Antes rodava sob StaffOrSessionGuard: um customer com
 * `x-session-token`/cookie `session_token` de qualquer mesa ativa passava o
 * guard como `actorType==='session'` e lia o faturamento de qualquer garçom
 * via `/staff/<uuid>/performance`. Fix: StaffOnlyGuard (mesmo swap de
 * B-NEW-20 e mesmas irmãs de dashboard neste controller).
 *
 * O guard REAL roda (não overrideGuard): prova que só credencial de STAFF
 * abre a rota e que um caller de SESSÃO (customer) é barrado.
 */
describe('GET /:slug/staff/:id/performance — StaffOnlyGuard enforcement (IDOR-read)', () => {
  let app: INestApplication;
  let prevKey: string | undefined;
  const getPerformance = jest.fn();
  // StaffOnlyGuard só toca o Redis quando há `x-staff-token`. Os testes
  // abaixo usam x-staff-key (sucesso) e x-session-token (rejeição sem tocar
  // Redis), então o stub `get` retornando null é suficiente e defensivo.
  const redisGet = jest.fn().mockResolvedValue(null);

  beforeAll(async () => {
    prevKey = process.env.STAFF_API_KEY;
    process.env.STAFF_API_KEY = STAFF_KEY;

    const moduleRef = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        { provide: StaffService, useValue: { getPerformance } },
        { provide: RedisService, useValue: { get: redisGet } },
        { provide: DataSource, useValue: { query: async () => [] } },
        { provide: ZoneAssignmentsService, useValue: {} },
        { provide: TenantConnectionProvider, useValue: { query: async () => [] } },
        { provide: CallerResolverService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (prevKey === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = prevKey;
    await app.close();
  });

  beforeEach(() => {
    getPerformance.mockReset();
    getPerformance.mockResolvedValue({
      staffId: 'staff-uuid',
      ordersServed: 42,
      totalRevenue: 999999,
      salesByDay: [],
      teamComparison: [],
    });
  });

  it('caller de SESSÃO (customer) → barrado, service NÃO é chamado (sem vazar faturamento)', async () => {
    // Token de sessão de customer: StaffOrSessionGuard aceitaria (actorType
    // session); StaffOnlyGuard rejeita porque não é x-staff-key/-token.
    await request(app.getHttpServer())
      .get('/acme-bistro/staff/staff-uuid/performance?period=30d')
      .set('x-session-token', 'customer-session-token-valido')
      .expect(403);
    expect(getPerformance).not.toHaveBeenCalled();
  });

  it('sem credencial → 403 e o service não é chamado', async () => {
    await request(app.getHttpServer())
      .get('/acme-bistro/staff/staff-uuid/performance')
      .expect(403);
    expect(getPerformance).not.toHaveBeenCalled();
  });

  it('x-staff-key inválido → 403', async () => {
    await request(app.getHttpServer())
      .get('/acme-bistro/staff/staff-uuid/performance')
      .set('x-staff-key', 'wrong-key')
      .expect(403);
    expect(getPerformance).not.toHaveBeenCalled();
  });

  it('caller STAFF (x-staff-key correto) → 200 (consumidor manager preservado)', async () => {
    const res = await request(app.getHttpServer())
      .get('/acme-bistro/staff/staff-uuid/performance?period=30d')
      .set('x-staff-key', STAFF_KEY)
      .expect(200);
    expect(res.body.totalRevenue).toBe(999999);
    expect(getPerformance).toHaveBeenCalledTimes(1);
    expect(getPerformance).toHaveBeenCalledWith('staff-uuid', '30d');
  });
});

/**
 * Privilege escalation staff→manager (re-scan de convergência #7) —
 * POST/PATCH/DELETE /:slug/staff eram guardadas SÓ por StaffOnlyGuard, que
 * NÃO checa role: retorna true pra QUALQUER x-staff-token válido (emitido no
 * login CPF+PIN de todo role) ou o x-staff-key compartilhado. Um garçom
 * logava normal, pegava o token, e:
 *   (a) PATCH /staff/<próprio-id> {role:'manager'} → auto-promovia;
 *   (b) POST  /staff {role:'manager',pin} → criava manager novo;
 *   (c) PATCH /staff/<qualquer-id> {pin} → resetava o PIN de qualquer um
 *       (incl. manager real) e logava como ele;
 *   (d) DELETE /staff/<manager-id> → removia o gerente.
 * Colapsava a hierarquia. staff.service.update() seta role/pin_hash direto do
 * DTO sem gate in-service; delete() é hard-delete.
 *
 * Auto-contradição no repo: a rota irmã StaffPinAdminController
 * POST /staff/:staffId/reset-pin JÁ é (StaffOnlyGuard, ManagerOnlyGuard)
 * ('waiter/host/cook nao resetam ninguem'), e zone-assignments POST/DELETE
 * também — mas o PATCH {pin} fazia o mesmo com só StaffOnly (bypass direto).
 *
 * Fix: create/update/delete ganham ManagerOnlyGuard (mesmo par das irmãs).
 * Guards REAIS rodam (não overrideGuard): token de WAITER → 403 e o service
 * NÃO roda; token de MANAGER → 2xx e o service roda.
 */
describe('POST/PATCH/DELETE /:slug/staff — ManagerOnlyGuard enforcement (privilege escalation)', () => {
  let app: INestApplication;
  let prevKey: string | undefined;

  const create = jest.fn();
  const update = jest.fn();
  const deleteFn = jest.fn();

  // Guards reais precisam de token de sessão (x-staff-token) verificado no
  // Redis + role reconferido no DB via getCachedActiveStaffRole. FakeRedis
  // guarda o payload do token; fakeTenantConn mapeia id→role.
  class FakeRedis {
    store = new Map<string, string>();
    sets = new Map<string, Set<string>>();
    async get(key: string): Promise<string | null> {
      return this.store.get(key) ?? null;
    }
    async set(key: string, value: string): Promise<void> {
      this.store.set(key, value);
    }
    async del(key: string): Promise<void> {
      this.store.delete(key);
      this.sets.delete(key);
    }
    async sadd(key: string, ...members: string[]): Promise<number> {
      let set = this.sets.get(key);
      if (!set) {
        set = new Set<string>();
        this.sets.set(key, set);
      }
      for (const m of members) set.add(m);
      return members.length;
    }
    async smembers(key: string): Promise<string[]> {
      return [...(this.sets.get(key) ?? [])];
    }
    async expire(): Promise<void> {
      /* TTL irrelevante em memória */
    }
  }

  // UUIDs próprios deste bloco — o staff-role-cache é um Map GLOBAL com TTL
  // de 60s; ids repetidos entre arquivos/blocos de teste vazariam roles.
  const MANAGER_ID = 'c9d3b2a1-2222-4222-8222-000000000201';
  const WAITER_ID = 'c9d3b2a1-2222-4222-8222-000000000202';
  const TARGET_ID = 'c9d3b2a1-2222-4222-8222-000000000203';
  const SLUG = 'acme-staff-mgmt';

  const redis = new FakeRedis();
  const tenantConn = {
    getTenantSlug: () => SLUG,
    query: async (sql: string, params: unknown[] = []) => {
      // getCachedActiveStaffRole (ManagerOnlyGuard): SELECT role FROM staff…
      if (/SELECT role FROM staff/i.test(sql)) {
        if (params[0] === MANAGER_ID) return [{ role: 'manager' }];
        if (params[0] === WAITER_ID) return [{ role: 'waiter' }];
        return [];
      }
      return [];
    },
  };

  let managerToken: string;
  let waiterToken: string;

  beforeAll(async () => {
    prevKey = process.env.STAFF_API_KEY;
    process.env.STAFF_API_KEY = STAFF_KEY;

    const moduleRef = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        { provide: StaffService, useValue: { create, update, delete: deleteFn } },
        { provide: RedisService, useValue: redis },
        { provide: DataSource, useValue: { query: async () => [] } },
        { provide: ZoneAssignmentsService, useValue: {} },
        { provide: TenantConnectionProvider, useValue: tenantConn },
        { provide: CallerResolverService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    managerToken = (
      await issueStaffSessionToken(redis as unknown as RedisService, {
        staffId: MANAGER_ID,
        role: 'manager',
        slug: SLUG,
      })
    ).token;
    waiterToken = (
      await issueStaffSessionToken(redis as unknown as RedisService, {
        staffId: WAITER_ID,
        role: 'waiter',
        slug: SLUG,
      })
    ).token;
  });

  afterAll(async () => {
    if (prevKey === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = prevKey;
    await app.close();
  });

  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    deleteFn.mockReset();
    create.mockResolvedValue({ id: 'new-uuid', name: 'Novo', role: 'manager' });
    update.mockResolvedValue({ id: TARGET_ID, name: 'Alvo', role: 'manager' });
    deleteFn.mockResolvedValue({ ok: true });
  });

  // ---- POST /staff (create) ----

  it('create: token de WAITER → 403 (ManagerOnly) e o service NÃO roda (não cria manager)', async () => {
    await request(app.getHttpServer())
      .post(`/${SLUG}/staff`)
      .set('x-staff-token', waiterToken)
      .send({ name: 'Fantasma', role: 'manager', pin: '1234' })
      .expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('create: token de MANAGER → 2xx e o service roda', async () => {
    await request(app.getHttpServer())
      .post(`/${SLUG}/staff`)
      .set('x-staff-token', managerToken)
      .send({ name: 'Novo', role: 'waiter', pin: '1234' })
      .expect(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  // ---- PATCH /staff/:id (update) — auto-promoção + reset de PIN alheio ----

  it('update: token de WAITER auto-promovendo (role:manager) → 403 e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/staff/${WAITER_ID}`)
      .set('x-staff-token', waiterToken)
      .send({ role: 'manager' })
      .expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('update: token de WAITER resetando PIN de outro (pin) → 403 e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/staff/${MANAGER_ID}`)
      .set('x-staff-token', waiterToken)
      .send({ pin: '1234' })
      .expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('update: token de MANAGER → 200 e o service roda', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/staff/${TARGET_ID}`)
      .set('x-staff-token', managerToken)
      .send({ name: 'Renomeado' })
      .expect(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  // ---- DELETE /staff/:id ----

  it('delete: token de WAITER removendo manager → 403 e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .delete(`/${SLUG}/staff/${MANAGER_ID}`)
      .set('x-staff-token', waiterToken)
      .expect(403);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('delete: token de MANAGER → 200 e o service roda', async () => {
    await request(app.getHttpServer())
      .delete(`/${SLUG}/staff/${TARGET_ID}`)
      .set('x-staff-token', managerToken)
      .expect(200);
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  // ---- x-staff-key compartilhada NÃO basta (não carrega identidade/role) ----

  it('create: x-staff-key compartilhada (sem token/x-staff-id) → BLOQUEADO e o service NÃO roda', async () => {
    // StaffOnlyGuard passa com a key, mas ManagerOnlyGuard não resolve
    // identidade individual (sem x-staff-token nem x-staff-id) → 401
    // (AUTH_MISSING). 401 ou 403, o efeito de segurança é o mesmo: a key
    // compartilhada sozinha não administra mais staff. O que importa é que
    // o request é barrado ANTES do service.
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/staff`)
      .set('x-staff-key', STAFF_KEY)
      .send({ name: 'Novo', role: 'waiter', pin: '1234' });
    expect([401, 403]).toContain(res.status);
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * PII/role leak read (P2 hardening) — GET /:slug/staff/:id (getById) era
 * read-only mas só StaffOnlyGuard: QUALQUER token de staff válido (waiter/
 * cook/host) lia name/role/cpf/phone/email de qualquer funcionário via
 * `/staff/<uuid>`. O único consumidor FE é `ScreenManagerStaffDetail`
 * (`/manager/equipe/[id]` via `staffRoster.get`) — manager-side. Casa com a
 * irmã list (roster) e com create/update/delete: leitura do dossiê de staff
 * é gestão. Fix: (StaffOnlyGuard, ManagerOnlyGuard).
 *
 * Guards REAIS rodam: token de WAITER → 403 e o service NÃO roda; token de
 * MANAGER → 200 e o service roda.
 */
describe('GET /:slug/staff/:id — ManagerOnlyGuard enforcement (PII/role leak)', () => {
  let app: INestApplication;
  let prevKey: string | undefined;

  const getById = jest.fn();

  class FakeRedis {
    store = new Map<string, string>();
    sets = new Map<string, Set<string>>();
    async get(key: string): Promise<string | null> {
      return this.store.get(key) ?? null;
    }
    async set(key: string, value: string): Promise<void> {
      this.store.set(key, value);
    }
    async del(key: string): Promise<void> {
      this.store.delete(key);
      this.sets.delete(key);
    }
    async sadd(key: string, ...members: string[]): Promise<number> {
      let set = this.sets.get(key);
      if (!set) {
        set = new Set<string>();
        this.sets.set(key, set);
      }
      for (const m of members) set.add(m);
      return members.length;
    }
    async smembers(key: string): Promise<string[]> {
      return [...(this.sets.get(key) ?? [])];
    }
    async expire(): Promise<void> {
      /* TTL irrelevante em memória */
    }
  }

  // UUIDs próprios deste bloco — o staff-role-cache é um Map GLOBAL com TTL
  // de 60s; ids repetidos entre blocos vazariam roles.
  const MANAGER_ID = 'd1e2f3a4-3333-4333-8333-000000000301';
  const WAITER_ID = 'd1e2f3a4-3333-4333-8333-000000000302';
  const TARGET_ID = 'd1e2f3a4-3333-4333-8333-000000000303';
  const SLUG = 'acme-staff-getbyid';

  const redis = new FakeRedis();
  const tenantConn = {
    getTenantSlug: () => SLUG,
    query: async (sql: string, params: unknown[] = []) => {
      if (/SELECT role FROM staff/i.test(sql)) {
        if (params[0] === MANAGER_ID) return [{ role: 'manager' }];
        if (params[0] === WAITER_ID) return [{ role: 'waiter' }];
        return [];
      }
      return [];
    },
  };

  let managerToken: string;
  let waiterToken: string;

  beforeAll(async () => {
    prevKey = process.env.STAFF_API_KEY;
    process.env.STAFF_API_KEY = STAFF_KEY;

    const moduleRef = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        { provide: StaffService, useValue: { getById } },
        { provide: RedisService, useValue: redis },
        { provide: DataSource, useValue: { query: async () => [] } },
        { provide: ZoneAssignmentsService, useValue: {} },
        { provide: TenantConnectionProvider, useValue: tenantConn },
        { provide: CallerResolverService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    managerToken = (
      await issueStaffSessionToken(redis as unknown as RedisService, {
        staffId: MANAGER_ID,
        role: 'manager',
        slug: SLUG,
      })
    ).token;
    waiterToken = (
      await issueStaffSessionToken(redis as unknown as RedisService, {
        staffId: WAITER_ID,
        role: 'waiter',
        slug: SLUG,
      })
    ).token;
  });

  afterAll(async () => {
    if (prevKey === undefined) delete process.env.STAFF_API_KEY;
    else process.env.STAFF_API_KEY = prevKey;
    await app.close();
  });

  beforeEach(() => {
    getById.mockReset();
    getById.mockResolvedValue({
      id: TARGET_ID,
      name: 'Alvo',
      role: 'manager',
      cpf: '12345678901',
      phone: '11999998888',
      email: 'alvo@acme.com',
    });
  });

  it('token de WAITER → 403 e o service NÃO roda (sem vazar PII/role)', async () => {
    await request(app.getHttpServer())
      .get(`/${SLUG}/staff/${TARGET_ID}`)
      .set('x-staff-token', waiterToken)
      .expect(403);
    expect(getById).not.toHaveBeenCalled();
  });

  it('x-staff-key compartilhada (sem identidade) → BLOQUEADO e o service NÃO roda', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/staff/${TARGET_ID}`)
      .set('x-staff-key', STAFF_KEY);
    expect([401, 403]).toContain(res.status);
    expect(getById).not.toHaveBeenCalled();
  });

  it('token de MANAGER → 200 e o service roda (consumidor ScreenManagerStaffDetail preservado)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/staff/${TARGET_ID}`)
      .set('x-staff-token', managerToken)
      .expect(200);
    expect(res.body.email).toBe('alvo@acme.com');
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith(TARGET_ID);
  });
});
