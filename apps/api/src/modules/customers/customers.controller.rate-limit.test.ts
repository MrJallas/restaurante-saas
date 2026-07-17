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

import { ExecutionContext, INestApplication } from '@nestjs/common';
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
  async set(key: string, value: string, _ttlSeconds?: number): Promise<void> {
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
const WELCOME_SESSION_A = '11111111-1111-4111-8111-111111111111';
const WELCOME_SESSION_B = '22222222-2222-4222-8222-222222222222';

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
            welcome: jest.fn(async () => ({
              customerId: 'cust-1',
              name: 'Cliente Teste',
              isReturning: false,
              totalVisits: 1,
              lastVisitSummary: null,
              visitId: 'visit-1',
              wasReclaim: false,
              locationCheck: null,
              recognitionToken: 'tok-welcome-1',
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
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string | string[] | undefined>;
            sessionData?: Record<string, unknown>;
          }>();
          const raw = req.headers['x-test-session-id'];
          const sessionId = (Array.isArray(raw) ? raw[0] : raw) || WELCOME_SESSION_A;
          req.sessionData = {
            sessionId,
            tableId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            tableCode: 'T01',
            tableLabel: 'Mesa 01',
            schemaName: 'restaurant_dev',
          };
          return true;
        },
      })
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

  it('emite a credencial CPF-only somente em cookie HttpOnly, nunca no JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/demo/customer/identify')
      .send({ cpf: VALID_CPF })
      .expect(201);

    expect(String(response.headers['set-cookie'])).toContain('recognition_token=tok-1');
    expect(String(response.headers['set-cookie']).toLowerCase()).toContain('httponly');
    expect(response.body).not.toHaveProperty('recognitionToken');
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

function welcomeRequest(
  server: Parameters<typeof request>[0],
  sessionId: string,
  forgedXff: string,
) {
  return request(server)
    .post('/demo/customer/welcome')
    .set('X-Test-Session-Id', sessionId)
    .set('X-Forwarded-For', forgedXff)
    .send({ name: 'Cliente Teste', cpf: VALID_CPF });
}

describe('POST /:slug/customer/welcome — grupos reais por IP + sessão de mesa', () => {
  const envKeys = [
    'CUSTOMER_WELCOME_RATE_MAX',
    'CUSTOMER_WELCOME_RATE_WINDOW_SECONDS',
    'CUSTOMER_WELCOME_RATE_LOCK_SECONDS',
  ] as const;
  let app: INestApplication | undefined;
  let redis: FakeRedis;
  let previousEnv: Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<
      (typeof envKeys)[number],
      string | undefined
    >;
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function boot(overrides: Partial<Record<(typeof envKeys)[number], string>> = {}) {
    Object.assign(process.env, overrides);
    redis = new FakeRedis();
    app = await makeApp(redis)();
    return app.getHttpServer();
  }

  it('welcome também mantém o bearer fora do body e em cookie HttpOnly', async () => {
    const server = await boot();
    const response = await welcomeRequest(server, WELCOME_SESSION_A, '203.0.113.10').expect(201);

    expect(String(response.headers['set-cookie'])).toContain('recognition_token=tok-welcome-1');
    expect(String(response.headers['set-cookie']).toLowerCase()).toContain('httponly');
    expect(response.body).not.toHaveProperty('recognitionToken');
  });

  it('aceita até 30 welcomes legítimos da mesma mesa/rede e só bloqueia o 31º', async () => {
    const server = await boot();

    for (let i = 0; i < 30; i++) {
      await welcomeRequest(server, WELCOME_SESSION_A, `203.0.113.${i}`).expect(201);
    }
    await welcomeRequest(server, WELCOME_SESSION_A, '203.0.113.250').expect(429);

    const attemptKeys = [...redis.seenKeys].filter((key) => key.endsWith(':attempts'));
    expect(attemptKeys).toHaveLength(1);
    expect(attemptKeys[0]).toContain(`:${WELCOME_SESSION_A}:attempts`);
  });

  it('isola mesas diferentes atrás do mesmo Wi-Fi/NAT', async () => {
    const server = await boot({ CUSTOMER_WELCOME_RATE_MAX: '2' });

    await welcomeRequest(server, WELCOME_SESSION_A, '198.51.100.1').expect(201);
    await welcomeRequest(server, WELCOME_SESSION_A, '198.51.100.2').expect(201);
    await welcomeRequest(server, WELCOME_SESSION_A, '198.51.100.3').expect(429);

    // Mesmo peer TCP, mas outra sessão de mesa: bucket independente.
    await welcomeRequest(server, WELCOME_SESSION_B, '198.51.100.200').expect(201);

    const attemptKeys = [...redis.seenKeys].filter((key) => key.endsWith(':attempts'));
    expect(attemptKeys).toHaveLength(2);
    expect(attemptKeys.some((key) => key.includes(WELCOME_SESSION_A))).toBe(true);
    expect(attemptKeys.some((key) => key.includes(WELCOME_SESSION_B))).toBe(true);
  });

  it('respeita o limite configurado e continua ignorando X-Forwarded-For', async () => {
    const server = await boot({ CUSTOMER_WELCOME_RATE_MAX: '3' });

    for (let i = 0; i < 3; i++) {
      await welcomeRequest(server, WELCOME_SESSION_A, `192.0.2.${i}`).expect(201);
    }
    await welcomeRequest(server, WELCOME_SESSION_A, '192.0.2.250').expect(429);

    const attemptKeys = [...redis.seenKeys].filter((key) => key.endsWith(':attempts'));
    expect(attemptKeys).toHaveLength(1);
  });
});
