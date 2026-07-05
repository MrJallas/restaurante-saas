/**
 * Rate-limit do /api/tv-unlock — lógica PURA (sem next/server) pra ser
 * unit-testável. O route.ts importa daqui.
 *
 * Dois tetos por janela:
 *  - per-IP (RATE_LIMIT): chave fina; preciso atrás de proxy confiável.
 *  - GLOBAL (GLOBAL_RATE_LIMIT): rede que pega brute-force do PIN via
 *    X-Forwarded-For ROTACIONADO. Num Route Handler não há socket TCP, então o
 *    IP é sempre header-derivado/forjável — sem o global, o atacante manda um
 *    XFF distinto por request, cada um cai num bucket per-IP fresco e o limite
 *    per-IP JAMAIS dispara (mesma classe do XFF-bypass que a API fechou em
 *    throttle-client-ip.ts). O global conta TODAS as tentativas, independente
 *    do IP. TV-unlock é raro (destrava uma TV por turno) → 30/min sobra pra uso
 *    legítimo e estrangula o brute-force (10^4-10^6 PINs a 30/min = inviável).
 */
export const RATE_LIMIT = 10;
export const GLOBAL_RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60_000;
// Cap absoluto pra evitar growth ilimitado se muitos IPs distintos chegarem.
const MAX_BUCKETS = 5000;

export interface RateLimitState {
  perIp: Map<string, { count: number; resetAt: number }>;
  global: { count: number; resetAt: number };
  cleanupCounter: number;
}

export function createRateLimitState(): RateLimitState {
  return { perIp: new Map(), global: { count: 0, resetAt: 0 }, cleanupCounter: 0 };
}

/**
 * Reprova se o teto per-IP OU o global for excedido na janela. Estado
 * INJETÁVEL (testável sem poluir módulo). `now` injetado pra testar a janela.
 */
export function evaluateRateLimit(state: RateLimitState, ip: string, now: number): boolean {
  if (++state.cleanupCounter % 100 === 0 || state.perIp.size > MAX_BUCKETS) {
    for (const [k, b] of state.perIp) {
      if (now >= b.resetAt) state.perIp.delete(k);
    }
    if (state.perIp.size > MAX_BUCKETS) {
      const toDelete = Math.ceil(state.perIp.size * 0.2);
      let i = 0;
      for (const key of state.perIp.keys()) {
        if (i++ >= toDelete) break;
        state.perIp.delete(key);
      }
    }
  }

  // Global backstop (conta SEMPRE, mesmo request que o per-IP reprovaria).
  if (now >= state.global.resetAt) {
    state.global = { count: 1, resetAt: now + RATE_WINDOW_MS };
  } else {
    state.global.count++;
  }
  const globalOk = state.global.count <= GLOBAL_RATE_LIMIT;

  // Per-IP (fino).
  const bucket = state.perIp.get(ip);
  let perIpOk: boolean;
  if (!bucket || now >= bucket.resetAt) {
    state.perIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    perIpOk = true;
  } else {
    bucket.count++;
    perIpOk = bucket.count <= RATE_LIMIT;
  }

  return perIpOk && globalOk;
}
