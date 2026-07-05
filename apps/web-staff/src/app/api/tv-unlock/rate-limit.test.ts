/**
 * Regressão: o Next 16 removeu `NextRequest.ip`, e a 1ª migração passou a
 * bucketizar o rate-limit por `x-forwarded-for` leftmost — reintroduzindo o
 * XFF-bypass (um atacante rotaciona o XFF e cada request cai num bucket per-IP
 * fresco → o limite per-IP JAMAIS dispara → brute-force do TV_ACCESS_PIN). O
 * backstop GLOBAL fecha isso: conta todas as tentativas por janela,
 * independente do IP. Sem estado injetável isto seria intestável (era).
 */
import { createRateLimitState, evaluateRateLimit } from './rate-limit';

const T0 = 1_000_000; // relógio fixo (dentro da janela de 60s)

describe('tv-unlock rate-limit', () => {
  it('per-IP: mesmo IP é barrado após 10 tentativas na janela', () => {
    const state = createRateLimitState();
    const results = [];
    for (let i = 0; i < 12; i++) results.push(evaluateRateLimit(state, '1.1.1.1', T0));
    // 10 passam, 11ª e 12ª barram.
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
    expect(results[11]).toBe(false);
  });

  it('GLOBAL backstop: XFF ROTACIONADO (IP distinto por request) é barrado após 30 — fecha o bypass', () => {
    const state = createRateLimitState();
    const results = [];
    // Cada request finge um IP novo (o que o XFF-bypass faz). No código
    // per-IP-only ANTIGO, TODOS passariam (bucket fresco por IP). Com o global,
    // a 31ª+ barra mesmo com IP sempre novo.
    for (let i = 0; i < 40; i++) results.push(evaluateRateLimit(state, `10.0.0.${i}`, T0));
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
    expect(results[39]).toBe(false);
    // Prova o furo antigo: sem o global, 40 IPs distintos = 40 permitidos.
    expect(results.filter(Boolean).length).toBe(30);
  });

  it('a janela reseta: após RATE_WINDOW_MS o mesmo IP volta a passar', () => {
    const state = createRateLimitState();
    for (let i = 0; i < 12; i++) evaluateRateLimit(state, '2.2.2.2', T0); // estoura per-IP
    expect(evaluateRateLimit(state, '2.2.2.2', T0)).toBe(false);
    // 61s depois: nova janela.
    expect(evaluateRateLimit(state, '2.2.2.2', T0 + 61_000)).toBe(true);
  });
});
