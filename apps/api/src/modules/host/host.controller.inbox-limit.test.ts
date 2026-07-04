/**
 * GET /:slug/host/inbox?limit=N — o controller parseia e clampa o `limit`
 * (1..100) antes de repassar pro service. Gap pré-existente notado na
 * prova viva de 2026-07-04: inbox() ignorava o query param e o service
 * caía sempre no default 30 (host-inbox.service.ts).
 *
 * Semântica escolhida: valor não numérico NÃO vira 400 — cai no default
 * do service (undefined), igual a omitir o param. Clamp só quando o parse
 * produz um número.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HostController } from './host.controller';
import { HostService } from './host.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';

describe('GET /:slug/host/inbox — parse/clamp do ?limit', () => {
  let app: INestApplication;
  const listInbox = jest.fn().mockResolvedValue([]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HostController],
      providers: [
        { provide: HostService, useValue: { listInbox } },
        { provide: CallerResolverService, useValue: {} },
      ],
    })
      // Guards reais têm regressão própria (staff.controller.guard.test.ts);
      // aqui o assunto é só o fio do query param.
      .overrideGuard(StaffOnlyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HostOrManagerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (qs: string) => request(app.getHttpServer()).get(`/demo/host/inbox${qs}`);

  it('repassa limit numérico dentro do range', async () => {
    await get('?limit=5').expect(200);
    expect(listInbox).toHaveBeenCalledWith(5);
  });

  it('sem ?limit repassa undefined (default 30 continua no service)', async () => {
    await get('').expect(200);
    expect(listInbox).toHaveBeenCalledWith(undefined);
  });

  it('limit não numérico cai no default (200, undefined — não 400)', async () => {
    await get('?limit=abc').expect(200);
    expect(listInbox).toHaveBeenCalledWith(undefined);
  });

  it('clampa abaixo do mínimo pra 1', async () => {
    await get('?limit=0').expect(200);
    expect(listInbox).toHaveBeenCalledWith(1);
  });

  it('clampa acima do máximo pra 100', async () => {
    await get('?limit=999').expect(200);
    expect(listInbox).toHaveBeenCalledWith(100);
  });

  it('trunca decimal pro inteiro (parseInt)', async () => {
    await get('?limit=2.9').expect(200);
    expect(listInbox).toHaveBeenCalledWith(2);
  });
});
