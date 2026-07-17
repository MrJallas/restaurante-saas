import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Token de sessão de staff — vincula o `staffId`/`role` reivindicado ao
 * portador da requisição através de um SEGREDO verificado server-side,
 * emitido só após o login CPF+PIN (staff-auth). Fecha o gap em que o par
 * `x-staff-key` (shared global) + `x-staff-id` (UUID enumerável via roster)
 * deixava qualquer waiter com a chave compartilhada escalar a manager/host
 * copiando o UUID de um manager — sem nunca provar o PIN dele.
 *
 * Design (opaque token, não JWT): o valor bruto é `randomBytes(32)` em
 * base64url. NÃO guardamos o token no Redis; guardamos o payload
 * (`staffId`/`role`/`slug`/`exp`) sob a key `staff-session:<sha256(token)>`.
 * Assim um dump do Redis não vaza tokens usáveis, e a verificação é
 * timing-safe (compara o slug e checa expiração além do lookup atômico).
 *
 * O `role` guardado é apenas um hint pro fast-path; a autorização final
 * continua reconferindo o role ativo no DB (`getCachedActiveStaffRole`),
 * então um staff rebaixado/desativado perde acesso mesmo com token vivo.
 */

export interface StaffSessionPayload {
  staffId: string;
  role: string;
  slug: string;
  exp: number;
  /** Identificador público revogável; nunca contém o token nem seu hash. */
  sessionId?: string;
  issuedAt?: number;
  ip?: string;
  userAgent?: string;
  /**
   * Enforcement server-side de troca de PIN forçada (P2 hardening). Setado
   * `true` no login quando o staff tem `must_change_pin` (PIN temporário
   * resetado pelo gerente). Enquanto `true`, os guards de staff RECUSAM o
   * token em toda rota privilegiada — só a rota de trocar o PIN (que verifica
   * o token no service, fora dos guards) o aceita. O change-pin de sucesso
   * emite um token NOVO sem a flag, então a restrição some sozinha. Não
   * confia no redirect do FE: o token temporário resetado não abre nada além
   * da própria troca.
   */
  mustChangePin?: boolean;
}

const STAFF_SESSION_TTL_SECONDS = Number(
  process.env.STAFF_SESSION_TTL_SECONDS ?? 12 * 60 * 60, // 12h — turno de trabalho
);

function redisKey(token: string): string {
  // sha256 do token → nunca persistimos o segredo em claro no Redis.
  return `staff-session:v1:${createHash('sha256').update(token).digest('hex')}`;
}

/**
 * Índice REVERSO por staff (TROCAR-PIN, decisão Caleb 2026-07-04): set com
 * as keys `staff-session:v1:<sha256>` de cada sessão viva do staff. Sem ele,
 * trocar/resetar o PIN não tinha como derrubar as OUTRAS sessões (device
 * roubado ficava logado por até 12h). Guarda a KEY hasheada, nunca o token.
 */
function sessionIndexKey(slug: string, staffId: string): string {
  return `staff-sessions:v1:${slug}:${staffId}`;
}

/**
 * Suporte a sets é feature-detected: o RedisService real sempre tem
 * sadd/smembers, mas fakes legados (ex.: auth-guards.spec, ts-node fora do
 * jest) só implementam get/set/del — o issue não pode explodir neles. A
 * REVOGAÇÃO, essa sim, exige um redis com sets.
 */
type SessionSetRedis = Pick<RedisService, 'sadd' | 'smembers' | 'expire' | 'del'> &
  Partial<Pick<RedisService, 'srem'>>;

function supportsSets(redis: RedisService): redis is RedisService & SessionSetRedis {
  const candidate = redis as Partial<SessionSetRedis>;
  return typeof candidate.sadd === 'function' && typeof candidate.smembers === 'function';
}

/**
 * Emite um token opaco vinculado ao staff autenticado e persiste o payload
 * no Redis com TTL. Retorna `{ token, expiresIn }` pro caller devolver ao
 * client (que passa a mandar em `x-staff-token`). Registra a sessão no
 * índice reverso do staff pra `revokeStaffSessions` alcançá-la depois.
 */
export async function issueStaffSessionToken(
  redis: RedisService,
  input: {
    staffId: string;
    role: string;
    slug: string;
    mustChangePin?: boolean;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ token: string; expiresIn: number }> {
  const token = randomBytes(32).toString('base64url');
  const issuedAt = Date.now();
  const exp = Date.now() + STAFF_SESSION_TTL_SECONDS * 1000;
  const payload: StaffSessionPayload = {
    staffId: input.staffId,
    role: input.role,
    slug: input.slug,
    exp,
    sessionId: randomUUID(),
    issuedAt,
    ...(input.ip ? { ip: input.ip.slice(0, 128) } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 512) } : {}),
    // Só embarca a flag quando true — token normal fica idêntico ao anterior.
    ...(input.mustChangePin ? { mustChangePin: true } : {}),
  };
  await redis.set(redisKey(token), JSON.stringify(payload), STAFF_SESSION_TTL_SECONDS);
  if (supportsSets(redis)) {
    const indexKey = sessionIndexKey(input.slug, input.staffId);
    await redis.sadd(indexKey, redisKey(token));
    // TTL do set realinhado a cada emissão — nunca menor que o TTL da
    // sessão mais nova, então o índice não morre antes das sessões.
    await redis.expire(indexKey, STAFF_SESSION_TTL_SECONDS);
  }
  return { token, expiresIn: STAFF_SESSION_TTL_SECONDS };
}

/**
 * Revoga TODAS as sessões vivas de um staff (troca de PIN, reset pelo
 * gerente, desligamento): SMEMBERS do índice reverso → DEL de cada
 * `staff-session:v1:<sha256>` → DEL do próprio set. Retorna quantas
 * sessões foram derrubadas.
 */
export async function revokeStaffSessions(
  redis: RedisService,
  input: { staffId: string; slug: string },
): Promise<number> {
  const indexKey = sessionIndexKey(input.slug, input.staffId);
  const sessionKeys = await redis.smembers(indexKey);
  for (const sessionKey of sessionKeys) {
    await redis.del(sessionKey);
  }
  await redis.del(indexKey);
  return sessionKeys.length;
}

export interface StaffSessionView {
  id: string;
  ip: string;
  userAgent: string;
  current: boolean;
  issuedAt: string;
  expiresAt: string;
}

function parseIndexedSession(raw: string | null): StaffSessionPayload | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as StaffSessionPayload;
    if (
      !payload ||
      typeof payload.staffId !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.slug !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function publicSessionId(payload: StaffSessionPayload, sessionKey: string): string {
  return payload.sessionId ?? sessionKey.replace(/^staff-session:v1:/, 'legacy-');
}

/** Lista somente sessões Redis reais, confinadas ao tenant e ao staff autenticado. */
export async function listStaffSessions(
  redis: RedisService,
  input: { staffId: string; slug: string; currentToken: string },
): Promise<StaffSessionView[]> {
  const currentKey = redisKey(input.currentToken);
  const indexKey = sessionIndexKey(input.slug, input.staffId);
  const sessionKeys = await redis.smembers(indexKey);
  const sessions: StaffSessionView[] = [];

  for (const sessionKey of sessionKeys) {
    const payload = parseIndexedSession(await redis.get(sessionKey));
    const invalid =
      !payload ||
      payload.exp <= Date.now() ||
      payload.staffId !== input.staffId ||
      payload.slug !== input.slug;
    if (invalid) {
      await redis.del(sessionKey);
      if (typeof (redis as Partial<RedisService>).srem === 'function') {
        await redis.srem(indexKey, sessionKey);
      }
      continue;
    }
    sessions.push({
      id: publicSessionId(payload, sessionKey),
      ip: payload.ip ?? 'não informado',
      userAgent: payload.userAgent ?? 'Dispositivo não identificado',
      current: sessionKey === currentKey,
      issuedAt: new Date(
        payload.issuedAt ?? payload.exp - STAFF_SESSION_TTL_SECONDS * 1000,
      ).toISOString(),
      expiresAt: new Date(payload.exp).toISOString(),
    });
  }

  return sessions.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return b.issuedAt.localeCompare(a.issuedAt);
  });
}

/** Revoga uma sessão Redis específica sem expor ou aceitar o token bruto. */
export async function revokeStaffSessionById(
  redis: RedisService,
  input: { staffId: string; slug: string; sessionId: string; currentToken: string },
): Promise<'revoked' | 'current' | 'not_found'> {
  const currentKey = redisKey(input.currentToken);
  const indexKey = sessionIndexKey(input.slug, input.staffId);
  const sessionKeys = await redis.smembers(indexKey);

  for (const sessionKey of sessionKeys) {
    const payload = parseIndexedSession(await redis.get(sessionKey));
    if (!payload || payload.staffId !== input.staffId || payload.slug !== input.slug) continue;
    if (publicSessionId(payload, sessionKey) !== input.sessionId) continue;
    if (sessionKey === currentKey) return 'current';
    await redis.del(sessionKey);
    if (typeof (redis as Partial<RedisService>).srem === 'function') {
      await redis.srem(indexKey, sessionKey);
    }
    return 'revoked';
  }
  return 'not_found';
}

function slugsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifica o token: lookup atômico no Redis, checa expiração e confina o
 * token ao MESMO tenant (slug) que o emitiu — um token de outro tenant não
 * autoriza aqui. Retorna o payload verificado (staffId/role vindos do
 * server, nunca de header client-controlled) ou `null` se inválido.
 */
export async function verifyStaffSessionToken(
  redis: RedisService,
  token: string | undefined,
  expectedSlug: string,
): Promise<StaffSessionPayload | null> {
  if (!token || typeof token !== 'string' || token.length < 16 || token.length > 512) {
    return null;
  }
  const raw = await redis.get(redisKey(token));
  if (!raw) return null;

  let payload: StaffSessionPayload;
  try {
    payload = JSON.parse(raw) as StaffSessionPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.staffId !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.slug !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  if (payload.exp <= Date.now()) return null;
  if (!slugsMatch(payload.slug, expectedSlug)) return null;

  return payload;
}
