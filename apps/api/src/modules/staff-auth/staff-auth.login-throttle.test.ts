import { HttpException, HttpStatus } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * Regressão do fix de bypass de lockout no login de staff.
 *
 * Antes: a chave de throttle era cpf:ip com `ip` derivado de X-Forwarded-For
 * (forjável). Rotacionando o header a cada tentativa, cada request caía numa
 * chave de contador diferente e o lock de 5 falhas nunca disparava → PIN de
 * 4 dígitos varrido sem bloqueio.
 *
 * Fixes:
 *  1. O controller passa a usar o IP REAL do peer TCP (testado no próprio
 *     controller — aqui provamos o comportamento do service).
 *  2. Defense-in-depth: lockout por (slug:cpf) INDEPENDENTE de IP, que trava
 *     o brute-force mesmo que o IP mude a cada tentativa (botnet).
 */

class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();

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
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  async expire(): Promise<void> {
    // TTL irrelevante para o teste em memória.
  }
}

function makeService(redis: FakeRedis): StaffAuthService {
  const tenantConn = {
    getTenantSlug: () => 'acme',
    query: async () => [], // nenhum staff → sempre falha de auth
  } as unknown as TenantConnectionProvider;
  return new StaffAuthService(tenantConn, redis as unknown as RedisService);
}

const CPF = '39053344705';

describe('StaffAuthService login brute-force lockout', () => {
  it('trava por (slug:cpf) mesmo com IP diferente a cada tentativa', async () => {
    const redis = new FakeRedis();
    const service = makeService(redis);

    // 20 tentativas erradas, cada uma vindo de um IP distinto (simula rotação
    // de IP / botnet). Sob o bug antigo, nenhum contador chegaria a 5.
    for (let i = 0; i < 20; i++) {
      await expect(service.login({ cpf: CPF, pin: '1234' }, `10.0.0.${i}`)).rejects.toBeInstanceOf(
        HttpException,
      );
    }

    // O lock por-CPF deve estar armado.
    expect(redis.store.has('staff-auth:login:cpf:acme:39053344705:lock')).toBe(true);

    // Próxima tentativa — de um IP inédito — já bate no lock com 429.
    try {
      await service.login({ cpf: CPF, pin: '1234' }, '203.0.113.99');
      throw new Error('esperava rejeição');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'AUTH_THROTTLED',
      });
    }
  });

  it('trava o par cpf:ip após 5 falhas do mesmo IP', async () => {
    const redis = new FakeRedis();
    const service = makeService(redis);

    for (let i = 0; i < 5; i++) {
      await expect(service.login({ cpf: CPF, pin: '1234' }, '198.51.100.7')).rejects.toBeInstanceOf(
        HttpException,
      );
    }

    expect(redis.store.has('staff-auth:login:acme:39053344705:198.51.100.7:lock')).toBe(true);

    try {
      await service.login({ cpf: CPF, pin: '1234' }, '198.51.100.7');
      throw new Error('esperava rejeição');
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'AUTH_THROTTLED',
      });
    }
  });
});
