/**
 * P1-C (IDOR) — GET /:slug/customer/last-visit resolvia o cliente por
 * `session.customerId` (o ÚLTIMO welcomer da mesa, compartilhado entre
 * todos os participantes) com PRIORIDADE sobre o cookie recognition_token
 * do CALLER. Resultado: cliente A tocava "repetir última visita" e recebia
 * itens+notes do cliente B (o último que fez welcome na mesma sessão).
 *
 * O WS gateway já resolve identidade por PARTICIPANTE (recognition_token
 * vence o customerId compartilhado — resolveRecognizedCustomer no
 * events.gateway). O REST agora segue o mesmo canon via
 * CallerResolverService: o customerId vem do cookie recognition_token do
 * caller, nunca do session.customerId compartilhado.
 *
 * Cenário: sessão com 2 clientes na mesma mesa (host + late-arrival).
 *  - A welcomou por último  → session.customerId = A
 *  - o CALLER tem cookie recognition_token de B
 *  → last-visit deve retornar a visita de B (o caller), NÃO de A.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { SessionGuard } from '../../common/guards/session.guard';
import type { SessionData } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // último welcomer (session.customerId)
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // o CALLER (dono do recognition_token)
const TOKEN_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('GET /:slug/customer/last-visit — identidade por caller (P1-C IDOR)', () => {
  let app: INestApplication;

  // Service retorna a visita "do A" ou "do B" conforme o customerId pedido,
  // provando qual identidade o controller usou pra consultar.
  const getLastVisitItems = jest.fn(async (customerId: string) => ({
    orderId: customerId === CUSTOMER_B ? 'order-de-B' : 'order-de-A',
    items: [],
    unavailableItems: [],
  }));

  // Mapeia o recognition_token -> customerId do caller, igual ao DB.
  const tryGetCustomerId = jest.fn(async (req: { cookies?: Record<string, string> }) =>
    req.cookies?.recognition_token === TOKEN_B ? CUSTOMER_B : null,
  );

  const session: SessionData = {
    sessionId: SESSION_ID,
    // A foi o último a fazer welcome nessa mesa → customerId compartilhado = A.
    customerId: CUSTOMER_A,
  } as SessionData;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CustomersService, useValue: { getLastVisitItems } },
        { provide: RedisService, useValue: {} },
        { provide: CallerResolverService, useValue: { tryGetCustomerId } },
      ],
    })
      // SessionGuard real depende de Redis/DB; aqui carimbamos a sessão
      // (com customerId = A) direto no request via `sessionData`, exatamente
      // como o guard faz (session.guard.ts:60) e o @Session() decorator lê.
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { sessionData?: SessionData } };
        }) => {
          ctx.switchToHttp().getRequest().sessionData = session;
          return true;
        },
      })
      // Guards das rotas VIP (markVip/unmarkVip) só entram no grafo de DI;
      // esta suíte não os exercita, mas precisam de override pra compilar.
      .overrideGuard(StaffOnlyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ManagerOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mesmo middleware do main.ts — popula `req.cookies` pro CallerResolver
    // ler o recognition_token, como em produção.
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna a visita do CALLER (B, dono do recognition_token), não do último welcomer (A)', async () => {
    const res = await request(app.getHttpServer())
      .get('/demo/customer/last-visit')
      .set('Cookie', `recognition_token=${TOKEN_B}`)
      .expect(200);

    expect(res.body.orderId).toBe('order-de-B');
    expect(getLastVisitItems).toHaveBeenCalledWith(CUSTOMER_B, SESSION_ID);
    expect(getLastVisitItems).not.toHaveBeenCalledWith(CUSTOMER_A, SESSION_ID);
  });

  it('sem recognition_token cai no comportamento seguro (401), sem vazar o A compartilhado', async () => {
    await request(app.getHttpServer()).get('/demo/customer/last-visit').expect(401);

    expect(getLastVisitItems).not.toHaveBeenCalledWith(CUSTOMER_A, SESSION_ID);
  });
});
