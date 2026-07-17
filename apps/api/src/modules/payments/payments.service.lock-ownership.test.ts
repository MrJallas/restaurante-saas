import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { BillingService } from '../billing/billing.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const LOCK_KEY = `payment_lock:${SESSION}:tablebill`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ownedRedis() {
  const store = new Map<string, string>();
  const owners: string[] = [];

  const redis = {
    setNX: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return false;
      store.set(key, value);
      owners.push(value);
      return true;
    }),
    compareAndDelete: jest.fn(async (key: string, expectedValue: string) => {
      if (store.get(key) !== expectedValue) return false;
      store.delete(key);
      return true;
    }),
    // Mantém o comportamento antigo disponível para o RED: o código vulnerável
    // chamava DEL incondicional e apagava o lock do owner sucessor.
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    forceExpire: (key: string) => store.delete(key),
    currentOwner: (key: string) => store.get(key),
    owners,
  };

  return redis;
}

async function waitForCalls(mock: jest.Mock, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 20 && mock.mock.calls.length < expected; attempt += 1) {
    await Promise.resolve();
  }
  expect(mock).toHaveBeenCalledTimes(expected);
}

describe('PaymentsService — ownership do lock Redis', () => {
  it('owner antigo não apaga o lock readquirido depois da expiração do lease', async () => {
    const redis = ownedRedis();
    const service = new PaymentsService(
      { query: jest.fn(async () => []) } as unknown as TenantConnectionProvider,
      redis as unknown as RedisService,
      {} as BillingService,
    );

    const first = deferred<{ id: string }>();
    const second = deferred<{ id: string }>();
    const compute = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    (
      service as unknown as {
        computeAndInsertPayment: typeof compute;
      }
    ).computeAndInsertPayment = compute;

    const requestA = service.requestPayment(SESSION, null, 'table', 'pix');
    await waitForCalls(compute, 1);
    const ownerA = redis.currentOwner(LOCK_KEY);

    // Simula o TTL do lock A expirando enquanto A ainda finaliza no banco.
    redis.forceExpire(LOCK_KEY);
    const requestB = service.requestPayment(SESSION, null, 'table', 'pix');
    await waitForCalls(compute, 2);
    const ownerB = redis.currentOwner(LOCK_KEY);
    expect(ownerB).toBeDefined();
    expect(ownerB).not.toBe(ownerA);

    // A termina depois de B adquirir. A liberação deve falhar por ownership,
    // preservando B e impedindo um terceiro writer concorrente.
    first.resolve({ id: 'payment-a' });
    await requestA;
    const ownerAfterARelease = redis.currentOwner(LOCK_KEY);

    const requestC = service
      .requestPayment(SESSION, null, 'table', 'pix')
      .catch((error: unknown) => error);
    second.resolve({ id: 'payment-b' });
    await requestB;

    expect(ownerAfterARelease).toBe(ownerB);
    await expect(requestC).resolves.toBeInstanceOf(BadRequestException);
    expect(redis.compareAndDelete).toHaveBeenCalledWith(LOCK_KEY, ownerA);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
