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
import { RedisService } from '../../infra/redis/redis.service';

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
