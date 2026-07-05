/**
 * Privilege escalation staff→manager (re-scan de convergência #8) —
 * POST/PATCH/DELETE /:slug/promotions eram guardadas SÓ por StaffOnlyGuard,
 * que NÃO checa role: retorna true pra QUALQUER x-staff-token válido (emitido
 * no login CPF+PIN de todo role) ou o x-staff-key compartilhado. Um garçom
 * logava normal, pegava o token, e:
 *   (a) POST   /promotions {discountType:'percentage',discountValue:100} →
 *       criava um 100%-off no tenant (o DTO @Min(1)@Max(1_000_000) aceita 100);
 *   (b) PATCH  /promotions/<id> → adulterava precificação legítima;
 *   (c) DELETE /promotions/<id> → apagava as promoções do gerente.
 * promotions.service.create/update/delete não têm gate in-service.
 *
 * Promoção é precificação de GESTÃO — o único consumidor FE de mutação é o
 * dashboard do gerente (apps/web-staff/.../dashboard/promocoes). Todas as
 * irmãs de mutação de gestão usam (StaffOnlyGuard, ManagerOnlyGuard);
 * promotions ficou de fora — mesma classe que a Wave 15 fechou no staff CRUD.
 *
 * Fix: create/update/delete ganham ManagerOnlyGuard (mesmo par das irmãs). GET
 * list/getById PERMANECEM públicos — o CLIENTE precisa ver os descontos.
 * Guards REAIS rodam (não overrideGuard): token de WAITER → 403 e o service
 * NÃO roda; token de MANAGER → 2xx e o service roda; GET segue aberto sem
 * credencial.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { issueStaffSessionToken } from '../../common/auth/staff-session-token';

const STAFF_KEY = 'test-staff-key-promotions';

describe('POST/PATCH/DELETE /:slug/promotions — ManagerOnlyGuard enforcement (privilege escalation)', () => {
  let app: INestApplication;
  let prevKey: string | undefined;

  const list = jest.fn();
  const getById = jest.fn();
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
  const MANAGER_ID = 'c9d3b2a1-3333-4333-8333-000000000301';
  const WAITER_ID = 'c9d3b2a1-3333-4333-8333-000000000302';
  const PROMO_ID = 'c9d3b2a1-3333-4333-8333-000000000303';
  const SLUG = 'acme-promos-mgmt';

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
      controllers: [PromotionsController],
      providers: [
        {
          provide: PromotionsService,
          useValue: { list, getById, create, update, delete: deleteFn },
        },
        { provide: RedisService, useValue: redis },
        { provide: TenantConnectionProvider, useValue: tenantConn },
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
    list.mockReset();
    getById.mockReset();
    create.mockReset();
    update.mockReset();
    deleteFn.mockReset();
    list.mockResolvedValue([{ id: PROMO_ID, title: 'Combo', discountType: 'percentage' }]);
    getById.mockResolvedValue({ id: PROMO_ID, title: 'Combo', discountType: 'percentage' });
    create.mockResolvedValue({ id: 'new-uuid', title: 'Nova', discountType: 'percentage' });
    update.mockResolvedValue({ id: PROMO_ID, title: 'Editada' });
    deleteFn.mockResolvedValue({ ok: true });
  });

  // ---- GET list/getById — PÚBLICOS (cliente precisa ver descontos) ----

  it('list: GET sem credencial → 200 (cliente vê descontos disponíveis)', async () => {
    const res = await request(app.getHttpServer()).get(`/${SLUG}/promotions`).expect(200);
    expect(res.body.promotions).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('getById: GET sem credencial → 200 (cliente vê o desconto)', async () => {
    await request(app.getHttpServer()).get(`/${SLUG}/promotions/${PROMO_ID}`).expect(200);
    expect(getById).toHaveBeenCalledTimes(1);
  });

  // ---- POST /promotions (create) — 100%-off attack ----

  it('create: token de WAITER (100%-off) → 403 (ManagerOnly) e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .post(`/${SLUG}/promotions`)
      .set('x-staff-token', waiterToken)
      .send({ title: 'x', discountType: 'percentage', discountValue: 100 })
      .expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('create: token de MANAGER → 2xx e o service roda', async () => {
    await request(app.getHttpServer())
      .post(`/${SLUG}/promotions`)
      .set('x-staff-token', managerToken)
      .send({ title: 'Combo do dia', discountType: 'percentage', discountValue: 15 })
      .expect(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  // ---- PATCH /promotions/:id (update) ----

  it('update: token de WAITER → 403 e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/promotions/${PROMO_ID}`)
      .set('x-staff-token', waiterToken)
      .send({ discountValue: 100 })
      .expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('update: token de MANAGER → 200 e o service roda', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/promotions/${PROMO_ID}`)
      .set('x-staff-token', managerToken)
      .send({ title: 'Renomeada' })
      .expect(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  // ---- DELETE /promotions/:id — apagar promoções do gerente ----

  it('delete: token de WAITER apagando promoção legítima → 403 e o service NÃO roda', async () => {
    await request(app.getHttpServer())
      .delete(`/${SLUG}/promotions/${PROMO_ID}`)
      .set('x-staff-token', waiterToken)
      .expect(403);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('delete: token de MANAGER → 200 e o service roda', async () => {
    await request(app.getHttpServer())
      .delete(`/${SLUG}/promotions/${PROMO_ID}`)
      .set('x-staff-token', managerToken)
      .expect(200);
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  // ---- x-staff-key compartilhada NÃO basta (não carrega identidade/role) ----

  it('create: x-staff-key compartilhada (sem token/x-staff-id) → BLOQUEADO e o service NÃO roda', async () => {
    // StaffOnlyGuard passa com a key, mas ManagerOnlyGuard não resolve
    // identidade individual (sem x-staff-token nem x-staff-id) → 401
    // (AUTH_MISSING). 401 ou 403, o efeito de segurança é o mesmo: a key
    // compartilhada sozinha não cria mais promoção. O que importa é que o
    // request é barrado ANTES do service.
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/promotions`)
      .set('x-staff-key', STAFF_KEY)
      .send({ title: 'x', discountType: 'percentage', discountValue: 100 });
    expect([401, 403]).toContain(res.status);
    expect(create).not.toHaveBeenCalled();
  });
});
