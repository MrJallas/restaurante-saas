/**
 * Round 16 (B-NEW-53): defensive `JSON.parse` wrapper pra hot paths
 * que leem strings vindas do Redis. Cenários onde malformed payload
 * pode aparecer:
 *  - Manual debug write (`redis-cli SET session:abc 'nope'`) — nunca
 *    deveria, mas acontece em staging/dev.
 *  - Race entre TTL expiry e read (rare, mas reproduzível com TTL=0).
 *  - Corrupted bytes em handoff entre cluster shards.
 *  - Mudança de formato em deploy enquanto tem keys antigas no cache.
 *
 * `JSON.parse` plain throw `SyntaxError` que crasha o handler/middleware
 * (5xx pro client). `safeJsonParse` retorna `null` e o caller trata
 * como cache miss / sessão inválida — comportamento idêntico ao key
 * inexistente.
 */
export function safeJsonParse<T = unknown>(value: string | null): T | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
