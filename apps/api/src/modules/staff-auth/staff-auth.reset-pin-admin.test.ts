import { INestApplication, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StaffAuthService } from './staff-auth.service';
import { StaffPinAdminController } from './staff-pin-admin.controller';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { verifyPin } from '../staff/staff-pin.util';
import {
  issueStaffSessionToken,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';

/**
 * Pacote TROCAR-PIN (decisões Caleb 2026-07-04) — POST /:slug/staff/:staffId/reset-pin.
 *
 * Gerente reseta o PIN de um staff: gera PIN temporário de 6 dígitos,
 * seta must_change_pin=true e revoga TODAS as sessões do alvo. O tempPin
 * volta UMA vez no body (o gerente fala pro staff). Guard: StaffOnlyGuard +
 * ManagerOnlyGuard REAIS (não overrideGuard) — waiter não reseta ninguém.
 */

class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();
  sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.counters.delete(key);
    this.sets.delete(key);
  }
  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    for (const member of members) set.add(member);
    return members.length;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(): Promise<void> {
    /* TTL irrelevante em memória */
  }
}

// UUIDs próprios deste arquivo — o staff-role-cache é um Map GLOBAL com TTL
// de 60s; ids repetidos entre arquivos de teste vazariam roles.
const MANAGER_ID = 'b7e2a1c0-1111-4111-8111-000000000101';
const WAITER_ID = 'b7e2a1c0-1111-4111-8111-000000000102';
const TARGET_ID = 'b7e2a1c0-1111-4111-8111-000000000103';
const SLUG = 'acme-reset-pin';

interface TargetRow {
  id: string;
  name: string;
}

function fakeTenantConn(target: TargetRow | null, updates: { sql: string; params: unknown[] }[]) {
  return {
    getTenantSlug: () => SLUG,
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*UPDATE staff/i.test(sql)) {
        updates.push({ sql, params });
        if (target && params[1] === target.id) {
          return [[{ id: target.id, name: target.name }], 1];
        }
        return [[], 0];
      }
      // getCachedActiveStaffRole (ManagerOnlyGuard): SELECT role FROM staff WHERE id…
      if (/SELECT role FROM staff/i.test(sql)) {
        if (params[0] === MANAGER_ID) return [{ role: 'manager' }];
        if (params[0] === WAITER_ID) return [{ role: 'waiter' }];
        return [];
      }
      return [];
    },
  };
}

describe('StaffAuthService.managerResetPin', () => {
  function makeService(target: TargetRow | null) {
    const redis = new FakeRedis();
    const updates: { sql: string; params: unknown[] }[] = [];
    const service = new StaffAuthService(
      fakeTenantConn(target, updates) as unknown as TenantConnectionProvider,
      redis as unknown as RedisService,
    );
    return { service, redis, updates };
  }

  it('gera tempPin de 6 dígitos, seta must_change_pin=true e revoga as sessões do alvo', async () => {
    const { service, redis, updates } = makeService({ id: TARGET_ID, name: 'Marina' });

    // Alvo tem 2 sessões vivas (2 devices) — ambas precisam morrer.
    const s1 = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: TARGET_ID,
      role: 'waiter',
      slug: SLUG,
    });
    const s2 = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: TARGET_ID,
      role: 'waiter',
      slug: SLUG,
    });

    const result = await service.managerResetPin(TARGET_ID);

    expect(result.code).toBe('PIN_RESET_TEMP');
    expect(result.tempPin).toMatch(/^\d{6}$/);
    expect(result.staff).toMatchObject({ id: TARGET_ID, name: 'Marina' });

    // UPDATE: hash do tempPin devolvido + flag must_change_pin=true. bcrypt é
    // não-determinístico — verifica-se que o hash gravado VALIDA o tempPin.
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toMatch(/must_change_pin\s*=\s*true/i);
    expect(updates[0].params[0]).toMatch(/^\$2[aby]\$/);
    expect(verifyPin(result.tempPin, updates[0].params[0] as string)).toBe(true);
    expect(updates[0].params[1]).toBe(TARGET_ID);

    // Sessões do alvo revogadas.
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, s1.token, SLUG),
    ).toBeNull();
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, s2.token, SLUG),
    ).toBeNull();
  });

  it('404 STAFF_NOT_FOUND pra staff inexistente/inativo', async () => {
    const { service } = makeService(null);
    try {
      await service.managerResetPin(TARGET_ID);
      throw new Error('esperava 404');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'STAFF_NOT_FOUND' });
    }
  });

  it('404 STAFF_NOT_FOUND pra staffId que não é UUID (sem bater no DB)', async () => {
    const { service, updates } = makeService({ id: TARGET_ID, name: 'Marina' });
    try {
      await service.managerResetPin('nao-e-uuid');
      throw new Error('esperava 404');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
    expect(updates).toHaveLength(0);
  });
});

describe('POST /:slug/staff/:staffId/reset-pin — guards reais (manager-only)', () => {
  let app: INestApplication;
  const redis = new FakeRedis();
  const managerResetPin = jest.fn();
  let managerToken: string;
  let waiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffPinAdminController],
      providers: [
        { provide: StaffAuthService, useValue: { managerResetPin } },
        { provide: RedisService, useValue: redis },
        {
          provide: TenantConnectionProvider,
          useValue: fakeTenantConn({ id: TARGET_ID, name: 'Marina' }, []),
        },
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
    await app.close();
  });

  beforeEach(() => {
    managerResetPin.mockReset();
    managerResetPin.mockResolvedValue({
      message_user: 'PIN temporário gerado.',
      code: 'PIN_RESET_TEMP',
      tempPin: '123456',
      staff: { id: TARGET_ID, name: 'Marina' },
    });
  });

  it('sem credencial → 403 e o service não roda', async () => {
    await request(app.getHttpServer()).post(`/${SLUG}/staff/${TARGET_ID}/reset-pin`).expect(403);
    expect(managerResetPin).not.toHaveBeenCalled();
  });

  it('token de waiter → 403 (ManagerOnly) e o service não roda', async () => {
    await request(app.getHttpServer())
      .post(`/${SLUG}/staff/${TARGET_ID}/reset-pin`)
      .set('x-staff-token', waiterToken)
      .expect(403);
    expect(managerResetPin).not.toHaveBeenCalled();
  });

  it('token de manager → 200 com o tempPin (uma vez só, no body)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/staff/${TARGET_ID}/reset-pin`)
      .set('x-staff-token', managerToken)
      .expect(200);

    expect(res.body.tempPin).toBe('123456');
    expect(res.body.code).toBe('PIN_RESET_TEMP');
    expect(managerResetPin).toHaveBeenCalledWith(TARGET_ID);
  });
});
