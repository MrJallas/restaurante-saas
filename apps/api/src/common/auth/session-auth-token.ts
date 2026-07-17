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
/** Default de DEV — público (está no source). Em prod é fail-fast (ver
 * `assertSessionSecretConfigured`). */
export const DEV_SESSION_TOKEN_SECRET = 'dev-session-token-secret-CHANGE-IN-PROD';
export const COMPROMISED_COMPOSE_SESSION_SECRET = 'dev-staging-session-secret-set-in-prod';

const SESSION_TOKEN_SECRET = process.env.SESSION_TOKEN_SECRET || DEV_SESSION_TOKEN_SECRET;

/**
 * Fail-fast do `SESSION_TOKEN_SECRET` (espelha `assertStaffKeyConfigured`). Sem
 * ele, o token de sessão é HMAC do default público de dev → qualquer um com o
 * source forja a sessão de um cliente cujo id vazou. Em prod: THROW no boot se
 * ausente ou == default. Em dev: só warn (local destravado).
 */
export function assertSessionSecretConfigured(
  logger: { warn(message: string): void },
  env: NodeJS.ProcessEnv = process.env,
): void {
  const secret = env.SESSION_TOKEN_SECRET;
  const isProd = env.NODE_ENV === 'production';

  if (secret === DEV_SESSION_TOKEN_SECRET || secret === COMPROMISED_COMPOSE_SESSION_SECRET) {
    throw new Error(
      'SESSION_TOKEN_SECRET usa um default público comprometido. Rotacione para um segredo único.',
    );
  }

  if (!secret) {
    if (isProd) {
      throw new Error('SESSION_TOKEN_SECRET nao configurada — obrigatoria em producao (A07).');
    }
    logger.warn('SESSION_TOKEN_SECRET vazia — usando default de dev. NUNCA em producao.');
    return;
  }
}

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
