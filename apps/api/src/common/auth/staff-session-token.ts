import { createHash, randomBytes, timingSafeEqual } from 'crypto';
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
}

const STAFF_SESSION_TTL_SECONDS = Number(
  process.env.STAFF_SESSION_TTL_SECONDS ?? 12 * 60 * 60, // 12h — turno de trabalho
);

function redisKey(token: string): string {
  // sha256 do token → nunca persistimos o segredo em claro no Redis.
  return `staff-session:v1:${createHash('sha256').update(token).digest('hex')}`;
}

/**
 * Emite um token opaco vinculado ao staff autenticado e persiste o payload
 * no Redis com TTL. Retorna `{ token, expiresIn }` pro caller devolver ao
 * client (que passa a mandar em `x-staff-token`).
 */
export async function issueStaffSessionToken(
  redis: RedisService,
  input: { staffId: string; role: string; slug: string },
): Promise<{ token: string; expiresIn: number }> {
  const token = randomBytes(32).toString('base64url');
  const exp = Date.now() + STAFF_SESSION_TTL_SECONDS * 1000;
  const payload: StaffSessionPayload = {
    staffId: input.staffId,
    role: input.role,
    slug: input.slug,
    exp,
  };
  await redis.set(redisKey(token), JSON.stringify(payload), STAFF_SESSION_TTL_SECONDS);
  return { token, expiresIn: STAFF_SESSION_TTL_SECONDS };
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
