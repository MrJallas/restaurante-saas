/**
 * Supertest de referência (prompt 100 §5.4) — prova o padrão HTTP-level:
 * Test.createTestingModule + overrideGuard + ValidationPipe global espelhada
 * do main.ts + supertest. Use este arquivo como template pra migrar outros
 * controllers (ver apps/api/TESTING.md).
 *
 * Cobre também o contrato novo do prompt 100 §2: o campo `surface` chega no
 * service (só 'assistente' consome mensagens de evento) e valores fora do
 * enum são rejeitados pelo class-validator.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ContinuationController } from './continuation.controller';
import { ContinuationService } from './continuation.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /:slug/continuation (HTTP contract)', () => {
  let app: INestApplication;
  const getContinuation = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContinuationController],
      providers: [{ provide: ContinuationService, useValue: { getContinuation } }],
    })
      .overrideGuard(StaffOrSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Espelha o pipeline do main.ts — sem isso o teste validaria menos que
    // a produção (whitelist + forbidNonWhitelisted + transform).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    getContinuation.mockReset();
    getContinuation.mockResolvedValue({
      kind: 'abriu_pedido',
      text: 'Seu pedido tá com a cozinha.',
      chips: [],
      meta: {},
    });
  });

  it('forwards surface=assistente to the service (consumo 1x por evento)', async () => {
    const res = await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ tableSessionId: SESSION_ID, surface: 'assistente' })
      .expect(201);

    expect(res.body.kind).toBe('abriu_pedido');
    expect(getContinuation).toHaveBeenCalledTimes(1);
    const [, , , signals] = getContinuation.mock.calls[0];
    expect(signals.surface).toBe('assistente');
  });

  it('defaults surface to null when omitted (leitura pura — não consome)', async () => {
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ tableSessionId: SESSION_ID })
      .expect(201);

    const [, , , signals] = getContinuation.mock.calls[0];
    expect(signals.surface).toBeNull();
  });

  it('rejects an unknown surface value (IsIn)', async () => {
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ tableSessionId: SESSION_ID, surface: 'kds' })
      .expect(400);
    expect(getContinuation).not.toHaveBeenCalled();
  });

  it('rejects a missing/malformed tableSessionId', async () => {
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ surface: 'assistente' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ tableSessionId: 'not-a-uuid' })
      .expect(400);
    expect(getContinuation).not.toHaveBeenCalled();
  });

  it('rejects unexpected fields (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .send({ tableSessionId: SESSION_ID, hack: true })
      .expect(400);
    expect(getContinuation).not.toHaveBeenCalled();
  });

  it('honours the x-continuation-kind-hint header fallback', async () => {
    await request(app.getHttpServer())
      .post('/restaurant_dev/continuation')
      .set('x-continuation-kind-hint', 'viu_menu')
      .send({ tableSessionId: SESSION_ID })
      .expect(201);

    const [, , , signals] = getContinuation.mock.calls[0];
    expect(signals.clientKindHint).toBe('viu_menu');
  });
});
