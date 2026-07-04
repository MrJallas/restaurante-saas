import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { verifyStaffSessionToken } from '../auth/staff-session-token';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quando `true`, o `x-staff-id` legado (não vinculado ao portador) é
 * REJEITADO — só o `x-staff-token` emitido no login autoriza. Deixe
 * `false` (default) enquanto os clients migram; ligue em prod assim que
 * o web-staff sempre mandar o token.
 */
function tokenRequired(): boolean {
  return process.env.STAFF_SESSION_REQUIRED === 'true';
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export interface ResolvedStaff {
  staffId: string;
  /** Só presente quando a origem foi o token verificado server-side. */
  tokenRole?: string;
  /** 'token' = vinculado ao PIN; 'header' = legado x-staff-id. */
  source: 'token' | 'header';
  error?: undefined;
}

export interface ResolvedStaffError {
  error: 'missing' | 'invalid';
}

/**
 * Resolve o staff autenticado da requisição preferindo o token de sessão
 * (segredo verificado server-side estabelecido pelo PIN). Cai pro
 * `x-staff-id` legado apenas quando o token está ausente e
 * `STAFF_SESSION_REQUIRED` não força.
 *
 * O `staffId` retornado NUNCA vem de header confiando cegamente: pelo
 * token, é extraído do payload verificado; pelo header legado, é só um
 * UUID sanitizado que o guard ainda reconfere no DB.
 */
export async function resolveAuthenticatedStaff(
  req: { headers: Record<string, string | string[] | undefined> },
  tenantConn: TenantConnectionProvider,
  redis: RedisService,
): Promise<ResolvedStaff | ResolvedStaffError> {
  const slug = tenantConn.getTenantSlug() ?? 'unknown';

  const token = headerValue(req.headers, 'x-staff-token');
  if (token) {
    const payload = await verifyStaffSessionToken(redis, token, slug);
    if (!payload) {
      // Token presente mas inválido/expirado/cross-tenant → nunca faz
      // fallback pro header (evita downgrade attack).
      return { error: 'invalid' };
    }
    return { staffId: payload.staffId, tokenRole: payload.role, source: 'token' };
  }

  if (tokenRequired()) {
    return { error: 'missing' };
  }

  // Fallback legado: x-staff-id (UUID). Ainda reconferido no DB pelo
  // guard chamador.
  const staffId = headerValue(req.headers, 'x-staff-id');
  if (!staffId || typeof staffId !== 'string') {
    return { error: 'missing' };
  }
  if (!UUID_RE.test(staffId)) {
    return { error: 'invalid' };
  }
  return { staffId, source: 'header' };
}
