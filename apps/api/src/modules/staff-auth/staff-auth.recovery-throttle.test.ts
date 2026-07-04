import { HttpException, HttpStatus } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * Regressão do fix de brute-force no fluxo de recuperação de PIN.
 *
 * Antes: verifyForgot() não tinha NENHUM contador — o código de 6 dígitos
 * (~1M combinações, TTL 10min) podia ser varrido sem lock → takeover.
 * Agora: após RECOVERY_MAX_ATTEMPTS (5) tentativas, o código é invalidado
 * (recoveryKey deletada) e o request é rejeitado com 429/RECOVERY_THROTTLED.
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
  async incrWithExpiry(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}

function makeService(redis: FakeRedis): StaffAuthService {
  const tenantConn = {
    getTenantSlug: () => 'acme',
    query: async () => [],
  } as unknown as TenantConnectionProvider;
  return new StaffAuthService(tenantConn, redis as unknown as RedisService);
}

const CPF = '39053344705'; // 11 dígitos válidos p/ normalizeCpf
const CORRECT_CODE = '123456';

function seedRecovery(redis: FakeRedis) {
  redis.store.set(
    'staff-auth:recovery:acme:39053344705',
    JSON.stringify({ staffId: 'staff-1', cpf: CPF, code: CORRECT_CODE }),
  );
}

describe('StaffAuthService recovery brute-force throttle', () => {
  it('rejeita e invalida o código após 5 tentativas erradas (fail-closed)', async () => {
    const redis = new FakeRedis();
    seedRecovery(redis);
    const service = makeService(redis);

    // 5 tentativas erradas → todas rejeitadas.
    for (let i = 0; i < 5; i++) {
      await expect(service.verifyForgot({ cpf: CPF, code: '000000' })).rejects.toBeInstanceOf(
        HttpException,
      );
    }

    // Na 5ª tentativa o código foi invalidado (recoveryKey deletada).
    expect(redis.store.has('staff-auth:recovery:acme:39053344705')).toBe(false);

    // 6ª tentativa — MESMO com o código CORRETO — é bloqueada com 429.
    try {
      await service.verifyForgot({ cpf: CPF, code: CORRECT_CODE });
      throw new Error('esperava rejeição');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'RECOVERY_THROTTLED',
      });
    }
  });

  it('permite verificação legítima dentro do limite e limpa o contador', async () => {
    const redis = new FakeRedis();
    seedRecovery(redis);
    const service = makeService(redis);

    // 2 erradas, depois a correta ainda passa.
    await expect(service.verifyForgot({ cpf: CPF, code: '000000' })).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.verifyForgot({ cpf: CPF, code: '111111' })).rejects.toBeInstanceOf(
      HttpException,
    );

    const res = await service.verifyForgot({ cpf: CPF, code: CORRECT_CODE });
    expect(res).toMatchObject({ code: 'RECOVERY_CODE_VERIFIED' });
    expect(res.resetToken).toBeTruthy();

    // Contador e recoveryKey limpos no sucesso.
    expect(redis.counters.has('staff-auth:recovery:attempts:acme:39053344705')).toBe(false);
    expect(redis.store.has('staff-auth:recovery:acme:39053344705')).toBe(false);
  });
});
