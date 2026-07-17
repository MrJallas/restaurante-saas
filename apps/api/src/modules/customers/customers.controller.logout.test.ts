import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

describe('POST /:slug/customer/logout', () => {
  let app: INestApplication;
  const revokeRecognitionToken = jest.fn().mockResolvedValue(true);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CustomersService, useValue: { revokeRecognitionToken } },
        { provide: RedisService, useValue: {} },
        { provide: CallerResolverService, useValue: {} },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StaffOnlyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ManagerOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => app.close());

  it('revoga o bearer e expira os cookies HttpOnly de identidade e mesa', async () => {
    const response = await request(app.getHttpServer())
      .post('/demo/customer/logout')
      .set('Cookie', 'recognition_token=token-antigo; session_token=sessao-antiga')
      .send({})
      .expect(201);

    expect(revokeRecognitionToken).toHaveBeenCalledWith('token-antigo');
    expect(response.body).toEqual({ ok: true, revoked: true });
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('recognition_token=;');
    expect(setCookie).toContain('session_token=;');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970');
  });
});
