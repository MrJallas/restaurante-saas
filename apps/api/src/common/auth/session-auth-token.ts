import { createHmac } from 'crypto';
import type { RedisService } from '../../infra/redis/redis.service';

/**
 * [SEGURANÇA A07] O token de auth do cliente (`x-session-token`/cookie
 * `session_token`) é SEPARADO do `table_sessions.id`.
 *
 * ANTES: token == table_sessions.id. Como o id vaza pro staff em vários DTOs
 * (host/tables, session-timeline, etc.), qualquer staff — ou qualquer código
 * que legitimamente exponha o id — entregava de brinde a CREDENCIAL do cliente,
 * permitindo forjar a sessão dele (hijack).
 *
 * AGORA: `token = HMAC-SHA256(SESSION_TOKEN_SECRET, sessionId)`.
 *  - **Secreto:** sem o server-side secret não dá pra derivar o token a partir
 *    do id → o id passa a ser um identificador de recurso INÓCUO (seguro de
 *    expor); a credencial é o token, que nunca sai em DTO nenhum.
 *  - **Determinístico:** o mesmo id sempre gera o mesmo token, então multi-device
 *    (reuse da mesma sessão ativa) reusa UMA chave Redis, e a invalidação por id
 *    (liberate/ttl-sweep) computa o token direto — sem reverse-map.
 *
 * O `SessionGuard`/handshake NÃO mudam: já leem `session:<token>`; agora o
 * `<token>` que o cliente manda é o HMAC. Sessões PRÉ-split (token==id, gravadas
 * sob `session:<id>`) seguem válidas até o TTL de 4h — os helpers de leitura/
 * invalidação POR ID caem no fallback `session:<id>` durante a transição.
 */
const SESSION_TOKEN_SECRET =
  process.env.SESSION_TOKEN_SECRET || 'dev-session-token-secret-CHANGE-IN-PROD';

/** `HMAC(secret, sessionId)` em hex — o token de auth do cliente. */
export function sessionAuthToken(sessionId: string): string {
  return createHmac('sha256', SESSION_TOKEN_SECRET).update(sessionId).digest('hex');
}

/**
 * Grava a sessão no Redis sob a chave do TOKEN (não do id). Retorna o token
 * pra ir no cookie/header. `dataJson` já serializado.
 */
export async function storeSessionAuth(
  redis: RedisService,
  sessionId: string,
  dataJson: string,
  ttlSeconds: number,
): Promise<string> {
  const token = sessionAuthToken(sessionId);
  await redis.set(`session:${token}`, dataJson, ttlSeconds);
  return token;
}

/**
 * Lê o payload da sessão pelo DB id (computa o token). Fallback pra chave legada
 * `session:<id>` durante a transição (sessões pré-split). Uso interno (staff
 * tenant-check no WS) — NÃO é auth de cliente.
 */
export async function readSessionAuthById(
  redis: RedisService,
  sessionId: string,
): Promise<string | null> {
  const byToken = await redis.get(`session:${sessionAuthToken(sessionId)}`);
  if (byToken != null) return byToken;
  return redis.get(`session:${sessionId}`);
}

/**
 * Invalida a sessão pelo DB id: DEL da chave do token E da legada `session:<id>`
 * (cobre sessões pré-split na transição). Usado por liberate/ttl-sweep.
 */
export async function invalidateSessionAuthById(
  redis: RedisService,
  sessionId: string,
): Promise<void> {
  await redis.del(`session:${sessionAuthToken(sessionId)}`);
  await redis.del(`session:${sessionId}`);
}
