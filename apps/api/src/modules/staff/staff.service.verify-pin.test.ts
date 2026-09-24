import { HttpException, HttpStatus } from '@nestjs/common';
import type { AttemptBucket, RedisService } from '../../infra/redis/redis.service';
import type { EventsGateway } from '../websocket/events.gateway';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import {
  clearAttemptsInMemory,
  networkHop,
  reserveAttemptInMemory,
} from '../../infra/redis/attempts-in-memory.testing';
import { hashPin } from './staff-pin.util';
import { StaffService } from './staff.service';

/**
 * verify-pin legado: dois baldes, por IP real (20/15 min) e por funcionário
 * (5/5 min), reservados ANTES da conferência. Antes a trava era checada,
 * o PIN conferido e só então a falha contada: uma rajada paralela passava
 * inteira pela checagem e cada requisição virava um palpite.
 */

const PIN = '4821';
const IP = '198.51.100.7';

class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();

  async reserveAttempt(...buckets: AttemptBucket[]): Promise<AttemptBucket | null> {
    await networkHop();
    return reserveAttemptInMemory(this, buckets);
  }
  async clearAttempts(...buckets: AttemptBucket[]): Promise<void> {
    clearAttemptsInMemory(this, buckets);
  }
}

function harness(staffIds: string[]) {
  const redis = new FakeRedis();
  const pinHash = hashPin(PIN);
  // Cada leitura do pin_hash é uma conferência de PIN que chegou a acontecer.
  const pinChecks = jest.fn(async (_sql: string, params: unknown[]) => {
    await networkHop();
    return staffIds.includes(params[0] as string) ? [{ pin_hash: pinHash }] : [];
  });
  const tenant = { getTenantSlug: () => 'acme', query: pinChecks };
  const service = new StaffService(
    tenant as unknown as TenantConnectionProvider,
    redis as unknown as RedisService,
    {} as EventsGateway,
  );
  return { service, redis, pinChecks };
}

function staffId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

async function outcome(promise: Promise<boolean>): Promise<string> {
  try {
    return (await promise) ? 'valid' : 'invalid';
  } catch (err) {
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    return String((err as HttpException).getResponse());
  }
}

describe('StaffService.verifyPin — limites de tentativa', () => {
  it('rajada paralela contra um funcionário: só 5 palpites chegam à conferência', async () => {
    const { service, pinChecks } = harness([staffId(1)]);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        outcome(service.verifyPin(staffId(1), String(1000 + i), IP)),
      ),
    );

    expect(pinChecks).toHaveBeenCalledTimes(5);
    expect(results.filter((r) => r === 'invalid')).toHaveLength(5);
    expect(results.filter((r) => r.startsWith('Muitas tentativas. Tente'))).toHaveLength(7);
  });

  it('rajada paralela espalhada entre funcionários: o balde por IP segura em 20', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => staffId(i + 1));
    const { service, pinChecks } = harness(ids);

    const results = await Promise.all(
      ids.map((id, i) => outcome(service.verifyPin(id, String(1000 + i), IP))),
    );

    expect(pinChecks).toHaveBeenCalledTimes(20);
    expect(
      results.filter((r) => r === 'Muitas tentativas deste IP. Aguarde alguns minutos.'),
    ).toHaveLength(10);
  });

  it('PIN certo zera os dois baldes', async () => {
    const { service, redis, pinChecks } = harness([staffId(1)]);

    for (let i = 0; i < 4; i++) {
      await expect(service.verifyPin(staffId(1), '0000', IP)).resolves.toBe(false);
    }
    await expect(service.verifyPin(staffId(1), PIN, IP)).resolves.toBe(true);

    expect(redis.counters.size).toBe(0);
    expect(redis.store.size).toBe(0);
    // Depois do acerto, o funcionário tem as 5 tentativas de novo.
    for (let i = 0; i < 5; i++) {
      await expect(service.verifyPin(staffId(1), '0000', IP)).resolves.toBe(false);
    }
    expect(pinChecks).toHaveBeenCalledTimes(10);
  });

  it('funcionário inexistente conta como falha nos dois baldes', async () => {
    const { service, redis } = harness([]);

    await expect(service.verifyPin(staffId(9), PIN, IP)).resolves.toBe(false);

    expect(redis.counters.get(`staff:pin_ip:${IP}:attempts`)).toBe(1);
    expect(redis.counters.get(`staff:pin_staff:${staffId(9)}:attempts`)).toBe(1);
  });
});
