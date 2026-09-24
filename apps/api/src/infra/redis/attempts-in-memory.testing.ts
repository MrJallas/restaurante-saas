import type { AttemptBucket } from './redis.service';

/**
 * `RedisService.reserveAttempt` / `clearAttempts` em memória, para os Redis
 * falsos dos testes. Reproduz o RESERVE_ATTEMPT_SCRIPT com as mesmas chaves
 * (`<key>:attempts` nos contadores, `<key>:lock` no store), então asserções
 * sobre elas valem igual. Só testes importam este arquivo (fora do build).
 */
interface AttemptsState {
  store: Map<string, string>;
  counters: Map<string, number>;
}

export function reserveAttemptInMemory(
  state: AttemptsState,
  buckets: AttemptBucket[],
): AttemptBucket | null {
  const locked = buckets.find((bucket) => state.store.has(`${bucket.key}:lock`));
  if (locked) return locked;
  for (const bucket of buckets) {
    const attemptsKey = `${bucket.key}:attempts`;
    const count = (state.counters.get(attemptsKey) ?? 0) + 1;
    state.counters.set(attemptsKey, count);
    if (count >= bucket.max) {
      state.store.set(`${bucket.key}:lock`, '1');
      state.counters.delete(attemptsKey);
    }
  }
  return null;
}

export function clearAttemptsInMemory(state: AttemptsState, buckets: AttemptBucket[]): void {
  for (const bucket of buckets) {
    state.store.delete(`${bucket.key}:lock`);
    state.counters.delete(`${bucket.key}:attempts`);
  }
}

/**
 * Cede um macrotask, como o round-trip de rede do Redis real. Sem isso uma
 * rajada paralela contra um fake nunca intercala e a corrida entre checar a
 * trava e contar a tentativa não aparece.
 */
export const networkHop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
