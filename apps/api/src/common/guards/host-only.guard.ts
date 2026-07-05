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
 * Host-or-manager guard · second layer on top of `StaffOnlyGuard`.
 *
 * Round 9 (B-NEW-33) hardening — espelha o fix do `ManagerOnlyGuard` no
 * round 7. Antes confiava em `x-staff-role` header CLIENT-CONTROLLED;
 * qualquer waiter com `x-staff-key` setava `x-staff-role: host` e
 * bypassa todo o módulo host (waitlist, reservations, swap, liberate,
 * VIP via TableMenu).
 *
 * Round 20 — binding criptográfico: mesmo fix do `ManagerOnlyGuard`.
 * Prefere `x-staff-token` (emitido no login CPF+PIN, verificado
 * server-side no Redis, confinado ao tenant); `x-staff-id` legado só
 * como fallback até `STAFF_SESSION_REQUIRED=true`. O role ativo é
 * reconferido no DB, aceita `role IN ('host', 'manager')`.
 *
 * Compose com `@UseGuards(StaffOnlyGuard, HostOrManagerGuard)` — o
 * StaffOnlyGuard valida `x-staff-key` shared secret antes.
 */
@Injectable()
export class HostOrManagerGuard implements CanActivate {
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
    if (resolved.error === 'pin_change_required') {
      // Defense-in-depth: o StaffOnlyGuard que compõe antes já bloqueia, mas
      // este guard também recusa por conta própria (P2 hardening).
      throw new ForbiddenException(
        authErrorResponse('AUTH_PIN_CHANGE_REQUIRED', 'Troca de PIN obrigatória antes de continuar.'),
      );
    }
    if (resolved.error) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }

    const role = await getCachedActiveStaffRole(this.tenantConn, resolved.staffId);

    if (!role) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }

    if (role !== 'host' && role !== 'manager') {
      throw new ForbiddenException(
        authErrorResponse('AUTH_FORBIDDEN', 'Acesso não permitido para este perfil'),
      );
    }

    return true;
  }
}
