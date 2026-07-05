/**
 * IP do peer TCP para chaves de rate-limit em rotas NÃO-autenticadas
 * (ou onde o throttle é a única barreira anti-abuse).
 *
 * Regra de ouro (OWASP API4 — Unrestricted Resource Consumption): a chave
 * do limiter NUNCA pode vir de `X-Forwarded-For` / `X-Real-IP` crus. Esses
 * headers são forjáveis pelo cliente; como a API é exposta direto (:3001)
 * sem `trust proxy`, um atacante manda um XFF diferente a cada request e
 * cada um cai numa chave distinta → o limite jamais dispara (enumeração
 * ilimitada de CPF em /identify, brute-force de token em /welcome, etc.).
 *
 * Fonte confiável = `req.socket.remoteAddress` (o IP real da conexão TCP,
 * que o cliente não controla). Mesma disciplina já aplicada nos guards
 * endurecidos: RedisThrottleGuard, RecoveryThrottleGuard e o
 * staff-auth.controller.clientIp. Normaliza o prefixo IPv4-mapeado em IPv6
 * (`::ffff:1.2.3.4` → `1.2.3.4`) pra não fragmentar o bucket do mesmo peer.
 *
 * Se um dia a API ficar atrás de um proxy CONFIÁVEL, o certo é configurar
 * `app.set('trust proxy', <hops>)` no main.ts e usar `req.ip` (que aí
 * respeita XFF só até os hops confiáveis) — NUNCA voltar a ler o header
 * diretamente.
 */
export interface RequestWithClientIp {
  socket?: { remoteAddress?: string };
  ip?: string;
}

export function throttleClientIp(req: RequestWithClientIp): string {
  const raw = req.socket?.remoteAddress ?? req.ip ?? 'unknown';
  return raw.replace(/^::ffff:/, '');
}
