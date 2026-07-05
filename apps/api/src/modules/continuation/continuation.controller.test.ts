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
import { CallerResolverService } from '../../common/services/caller-resolver.service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /:slug/continuation (HTTP contract)', () => {
  let app: INestApplication;
  const getContinuation = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContinuationController],
      providers: [
        { provide: ContinuationService, useValue: { getContinuation } },
        { provide: CallerResolverService, useValue: { tryGetCustomerId: jest.fn() } },
      ],
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

/**
 * P1 IDOR-READ (re-scan de convergência #4): um caller de SESSÃO (customer)
 * não pode ler a continuation de OUTRA mesa passando `tableSessionId` alheio
 * no body — o service tem que receber SEMPRE o `sessionData.sessionId` do
 * token dele (+ customerId derivado do cookie via callerResolver). Staff
 * (x-staff-key) mantém acesso cross-mesa legítimo: o body vence.
 *
 * Espelha o padrão de home.controller (B-NEW-63) e late-arrival.controller
 * (B-NEW-58): branch por `req.actorType` carimbado pelo StaffOrSessionGuard.
 */
describe('POST /:slug/continuation · IDOR-READ (session vs staff ownership)', () => {
  const OWN_SESSION_ID = '22222222-2222-4222-8222-222222222222';
  const FOREIGN_SESSION_ID = '33333333-3333-4333-8333-333333333333';
  const VICTIM_CUSTOMER_ID = '99999999-9999-4999-8999-999999999999';
  const OWN_CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';

  const getContinuation = jest.fn();
  const tryGetCustomerId = jest.fn();

  // Guard configurável: cada teste seta `actorType`/`sessionData` no request,
  // exatamente como o StaffOrSessionGuard faz em produção (linhas 52-84).
  let stampRequest: (req: Record<string, unknown>) => void;

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContinuationController],
      providers: [
        { provide: ContinuationService, useValue: { getContinuation } },
        { provide: CallerResolverService, useValue: { tryGetCustomerId } },
      ],
    })
      .overrideGuard(StaffOrSessionGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          stampRequest(ctx.switchToHttp().getRequest());
          return true;
        },
      })
      .compile();

    const built = moduleRef.createNestApplication();
    built.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await built.init();
    return built;
  }

  beforeEach(() => {
    getContinuation.mockReset();
    getContinuation.mockResolvedValue({ kind: 'first_time', text: 'oi', chips: [], meta: {} });
    tryGetCustomerId.mockReset();
  });

  it('session caller: IGNORA tableSessionId estrangeiro do body — usa o da própria sessão', async () => {
    tryGetCustomerId.mockResolvedValue(OWN_CUSTOMER_ID);
    stampRequest = (req) => {
      req.actorType = 'session';
      req.sessionData = { sessionId: OWN_SESSION_ID };
    };
    const localApp = await buildApp();
    try {
      // Ataque: cliente da própria mesa passa o sessionId de OUTRA mesa ativa +
      // customerId da vítima, tentando vazar PII cross-session.
      await request(localApp.getHttpServer())
        .post('/restaurant_dev/continuation')
        .send({
          tableSessionId: FOREIGN_SESSION_ID,
          customerId: VICTIM_CUSTOMER_ID,
          surface: 'assistente',
        })
        .expect(201);

      expect(getContinuation).toHaveBeenCalledTimes(1);
      const [tableSessionId, customerId] = getContinuation.mock.calls[0];
      // Não vaza a mesa estrangeira: o service recebe a sessão do PRÓPRIO token.
      expect(tableSessionId).toBe(OWN_SESSION_ID);
      expect(tableSessionId).not.toBe(FOREIGN_SESSION_ID);
      // Não vaza o customer da vítima: customerId derivado do cookie, não do body.
      expect(customerId).toBe(OWN_CUSTOMER_ID);
      expect(customerId).not.toBe(VICTIM_CUSTOMER_ID);
    } finally {
      await localApp.close();
    }
  });

  it('session caller sem identificação: customerId cai em null (não usa o do body)', async () => {
    tryGetCustomerId.mockResolvedValue(null);
    stampRequest = (req) => {
      req.actorType = 'session';
      req.sessionData = { sessionId: OWN_SESSION_ID };
    };
    const localApp = await buildApp();
    try {
      await request(localApp.getHttpServer())
        .post('/restaurant_dev/continuation')
        .send({ tableSessionId: FOREIGN_SESSION_ID, customerId: VICTIM_CUSTOMER_ID })
        .expect(201);

      const [tableSessionId, customerId] = getContinuation.mock.calls[0];
      expect(tableSessionId).toBe(OWN_SESSION_ID);
      expect(customerId).toBeNull();
    } finally {
      await localApp.close();
    }
  });

  it('staff caller: PRESERVA o tableSessionId do body (acesso cross-mesa legítimo)', async () => {
    // Staff nunca deriva customerId via callerResolver — usa o body.
    stampRequest = (req) => {
      req.actorType = 'staff';
    };
    const localApp = await buildApp();
    try {
      await request(localApp.getHttpServer())
        .post('/restaurant_dev/continuation')
        .send({ tableSessionId: FOREIGN_SESSION_ID, customerId: VICTIM_CUSTOMER_ID })
        .expect(201);

      const [tableSessionId, customerId] = getContinuation.mock.calls[0];
      expect(tableSessionId).toBe(FOREIGN_SESSION_ID);
      expect(customerId).toBe(VICTIM_CUSTOMER_ID);
      // Staff não passa pelo callerResolver.
      expect(tryGetCustomerId).not.toHaveBeenCalled();
    } finally {
      await localApp.close();
    }
  });
});
