/**
 * P1 OWASP API4 (Unrestricted Resource Consumption / rate-limit bypass).
 *
 * Antes: a chave do rate-limit de /identify e /welcome (rotas cujo throttle
 * é a ÚNICA barreira anti-abuse) derivava o "IP" do cliente do header
 * `X-Forwarded-For` (leftmost, `.split(',')[0]`). Com a API exposta direto
 * no :3001 e SEM `trust proxy`, o XFF é forjável: o atacante manda um valor
 * diferente a cada request e cada um cai numa chave de contador distinta →
 * o lock de 5 tentativas NUNCA dispara. Resultado em /identify: enumeração
 * ILIMITADA de CPF colhendo nome real + nº de visitas de qualquer pessoa.
 *
 * Fix: a chave passa a usar o IP REAL do peer TCP (`req.socket.remoteAddress`
 * via `throttleClientIp`), que o cliente não controla. Mesma disciplina dos
 * guards endurecidos (RedisThrottleGuard / RecoveryThrottleGuard /
 * staff-auth.controller). O XFF é ignorado; o bucket é por conexão real.
 *
 * RED (sob o bug): 5 requests do MESMO peer com XFF DIFERENTES caem em 5
 * chaves distintas → nenhuma atinge o limite → todas passam.
 * GREEN (com o fix): as 5 caem na MESMA chave (remoteAddress) → o lock arma
 * → a 6ª (ainda variando o XFF) leva 429.
 *
 * Legítimo preservado: um cliente real, com um único peer, é limitado
 * corretamente (o teste GREEN prova exatamente isso — a variação de XFF é
 * irrelevante porque não entra mais na chave).
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RedisService } from '../../infra/redis/redis.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

// Redis em memória com TTL ignorado — só o comportamento de contador/lock
// importa aqui. Registra as chaves usadas pra provar que o XFF forjado NÃO
// fragmenta o bucket.
class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();
  seenKeys = new Set<string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.counters.delete(key);
  }
  async incr(key: string): Promise<number> {
    this.seenKeys.add(key);
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  async expire(): Promise<void> {
    // TTL irrelevante para o teste em memória.
  }
}

const VALID_CPF = '39053344705';

function makeApp(redis: FakeRedis) {
  return async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: {
            // Sucesso trivial — o que importa é o rate-limit em volta.
            identify: jest.fn(async () => ({
              customerId: 'cust-1',
              isReturning: true,
              canonicalName: 'Fulano',
              customer: {},
              recognitionToken: 'tok-1',
            })),
          },
        },
        { provide: RedisService, useValue: redis },
        { provide: CallerResolverService, useValue: {} },
      ],
    })
      // Guards das outras rotas do controller (welcome/recognize/last-visit e
      // VIP) só precisam entrar no grafo de DI pra compilar; SessionGuard real
      // depende de DataSource/Redis. /identify não usa nenhum deles.
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StaffOnlyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ManagerOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };
}

describe('POST /:slug/customer/identify — rate-limit por IP real (não XFF forjável)', () => {
  let app: INestApplication;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();
    app = await makeApp(redis)();
  });

  afterEach(async () => {
    await app.close();
  });

  it('conta requests do MESMO peer no MESMO bucket mesmo com X-Forwarded-For rotacionado, disparando 429', async () => {
    const server = app.getHttpServer();

    // 5 tentativas, cada uma com um XFF forjado DIFERENTE. Todas do mesmo
    // peer TCP (loopback do supertest). Sob o bug, cada XFF criava uma chave
    // nova e nenhuma trancava. Com o fix, as 5 vão pro mesmo remoteAddress.
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/demo/customer/identify')
        .set('X-Forwarded-For', `203.0.113.${i}`)
        .send({ cpf: VALID_CPF })
        .expect(201);
    }

    // Após 5 falhas/sucessos do mesmo peer o lock deve estar armado → a 6ª
    // (com AINDA outro XFF forjado) bate no 429.
    await request(server)
      .post('/demo/customer/identify')
      .set('X-Forwarded-For', '203.0.113.250')
      .send({ cpf: VALID_CPF })
      .expect(429);

    // Prova estrutural: todas as tentativas usaram UMA única chave de
    // attempts (o remoteAddress), não uma por XFF. `unknown` seria sinal de
    // que caiu no fallback — aceitamos qualquer sufixo desde que seja único.
    const attemptKeys = [...redis.seenKeys].filter((k) => k.endsWith(':attempts'));
    expect(attemptKeys).toHaveLength(1);
    expect(attemptKeys[0]).toMatch(/^customers:identify:/);
  });
});
