import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { authErrorResponse } from './auth-error-response';
import { getCachedActiveStaffRole } from './staff-role-cache';
import { resolveAuthenticatedStaff } from './staff-auth-context';

/**
 * Manager-only guard · second layer on top of `StaffOnlyGuard`.
 *
 * Round 7 (B-NEW-22) hardening: ANTES o guard confiava em `x-staff-role`
 * header CLIENT-CONTROLLED — qualquer waiter/cook com `x-staff-key`
 * setava `x-staff-role: manager` no curl e bypassa zone-pause, VIP
 * flags, complaint respond, escalation. **Toda a hierarquia de roles
 * colapsava.**
 *
 * Round 20 (B-NEW-*) — binding criptográfico do staffId ao portador:
 * o gap anterior era que `x-staff-id` (UUID) só passava por check de
 * formato + lookup DB, e o roster (id→role) vazava via GET /staff. Um
 * waiter com o `x-staff-key` shared copiava o UUID de um manager e
 * escalava sem NUNCA provar o PIN dele. AGORA o guard exige, quando
 * disponível, o `x-staff-token` — token opaco emitido só no login
 * CPF+PIN (staff-auth), verificado server-side no Redis e confinado ao
 * tenant. O `staffId`/`role` vêm do payload verificado, nunca de header
 * client-controlled; o role ativo ainda é reconferido no DB, então um
 * manager rebaixado perde acesso mesmo com token vivo.
 *
 * Compat: enquanto todos os clients não migram pro token, o header
 * legado `x-staff-id` (UUID sanitizado + lookup DB) continua aceito como
 * fallback, a menos que `STAFF_SESSION_REQUIRED=true` force o token.
 *
 * Compose com `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)` — o
 * StaffOnlyGuard valida `x-staff-key` shared secret antes. Sem ele,
 * este nem roda.
 */
@Injectable()
export class ManagerOnlyGuard implements CanActivate {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const resolved = await resolveAuthenticatedStaff(req, this.tenantConn, this.redis);

    if (resolved.error === 'missing') {
      throw new UnauthorizedException(authErrorResponse('AUTH_MISSING', 'Sessão expirada'));
    }
    if (resolved.error) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }

    // Confirma o role ativo no DB (fast-path via cache) — nunca confia só
    // no role embutido no token. Staff desativado/rebaixado é bloqueado.
    const role = await getCachedActiveStaffRole(this.tenantConn, resolved.staffId);

    if (!role) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }

    if (role !== 'manager') {
      throw new ForbiddenException(
        authErrorResponse('AUTH_FORBIDDEN', 'Acesso não permitido para este perfil'),
      );
    }

    return true;
  }
}
