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

  it('getById: sem x-staff-key → 403', async () => {
    await request(app.getHttpServer()).get('/acme-bistro/staff/uuid-1').expect(403);
    expect(getById).not.toHaveBeenCalled();
  });

  it('getById: x-staff-key correto → 200', async () => {
    await request(app.getHttpServer())
      .get('/acme-bistro/staff/uuid-1')
      .set('x-staff-key', STAFF_KEY)
      .expect(200);
    expect(getById).toHaveBeenCalledTimes(1);
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
