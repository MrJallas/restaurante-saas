import { HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';
import { CustomersService } from '../customers/customers.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

const req = { cookies: { recognition_token: 'recognition-token' } } as unknown as Request;

function controller(status: 'pending' | 'fulfilled') {
  const service = {
    createCustomerRequest: jest.fn(async () => ({
      protocolNumber: 'LGPD-2026-07-11-0001',
      status,
      executedAt: status === 'fulfilled' ? '2026-07-11T00:00:00.000Z' : null,
      retryable: status === 'pending',
    })),
  };
  const customers = {
    resolveByRecognitionToken: jest.fn(async () => ({ customerId: 'customer-1' })),
  };
  return {
    service,
    controller: new LgpdController(
      service as unknown as LgpdService,
      customers as unknown as CustomersService,
    ),
  };
}

describe('LgpdController — resposta honesta de erasure', () => {
  it('store incompleta fica registrada, mas HTTP responde 503 em vez de sucesso', async () => {
    const ctx = controller('pending');

    const outcome = ctx.controller
      .create('demo', 'restaurant_dev', { kind: 'erasure' }, req)
      .catch((error: unknown) => error);

    await expect(outcome).resolves.toBeInstanceOf(HttpException);
    const error = (await outcome) as HttpException;
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.getResponse()).toMatchObject({
      status: 'pending',
      retryable: true,
      protocolNumber: 'LGPD-2026-07-11-0001',
    });
  });

  it('só retorna sucesso quando o service confirmou fulfilled', async () => {
    const ctx = controller('fulfilled');

    await expect(
      ctx.controller.create('demo', 'restaurant_dev', { kind: 'erasure' }, req),
    ).resolves.toMatchObject({ status: 'fulfilled' });
  });

  it('ignora identidade corporal de atacante e encaminha só o customer autenticado', async () => {
    const ctx = controller('fulfilled');
    const attackerBody = {
      kind: 'erasure' as const,
      customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      customerCpf: '98765432100',
      customerEmail: 'vitima@example.com',
    };

    await ctx.controller.create(
      'demo',
      'restaurant_dev',
      attackerBody as Parameters<LgpdController['create']>[2],
      req,
    );

    expect(ctx.service.createCustomerRequest).toHaveBeenCalledWith(
      {
        kind: 'erasure',
        customerId: 'customer-1',
        notes: undefined,
      },
      'restaurant_dev',
      'demo',
    );
    expect(ctx.service.createCustomerRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ customerCpf: '98765432100' }),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('LgpdController — validação HTTP da identidade customer', () => {
  let app: INestApplication;
  const createCustomerRequest = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LgpdController],
      providers: [
        { provide: LgpdService, useValue: { createCustomerRequest, list: jest.fn() } },
        {
          provide: CustomersService,
          useValue: { resolveByRecognitionToken: jest.fn() },
        },
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejeita CPF/e-mail enviados no body antes de chamar o serviço', async () => {
    await request(app.getHttpServer())
      .post('/demo/lgpd-requests')
      .send({
        kind: 'erasure',
        customerCpf: '98765432100',
        customerEmail: 'vitima@example.com',
      })
      .expect(400);

    expect(createCustomerRequest).not.toHaveBeenCalled();
  });
});
