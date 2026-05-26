import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { authErrorResponse } from './auth-error-response';
import { getCachedActiveStaffRole } from './staff-role-cache';

/**
 * Manager-only guard · second layer on top of `StaffOnlyGuard`.
 *
 * Round 7 (B-NEW-22) hardening: ANTES o guard confiava em `x-staff-role`
 * header CLIENT-CONTROLLED — qualquer waiter/cook com `x-staff-key`
 * setava `x-staff-role: manager` no curl e bypassa zone-pause, VIP
 * flags, complaint respond, escalation. **Toda a hierarquia de roles
 * colapsava.**
 *
 * AGORA: o guard pega `x-staff-id` (UUID do staff que se autentica
 * via PIN antes) e faz query no DB `SELECT role FROM staff WHERE id =
 * $1 AND is_active = true`. Só passa se `role === 'manager'`. Atacante
 * com staff-key mas sem manager-id real é bloqueado.
 *
 * Compose com `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)` — o
 * StaffOnlyGuard valida `x-staff-key` shared secret antes (round 4
 * STAFF_API_KEY env). Sem ele, este nem roda.
 *
 * **Pendente médio-prazo**: substituir `x-staff-key` shared + `x-staff-id`
 * por JWT per-staff assinado server-side com role embutida (eliminaria
 * o lookup DB e impediria spoofing de staff-id mesmo conhecendo o
 * shared key). Vide deferred para round 8+.
 */
@Injectable()
export class ManagerOnlyGuard implements CanActivate {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const staffIdHeader = req.headers['x-staff-id'];
    const staffId = Array.isArray(staffIdHeader) ? staffIdHeader[0] : staffIdHeader;

    if (!staffId || typeof staffId !== 'string') {
      throw new UnauthorizedException(authErrorResponse('AUTH_MISSING', 'Sessão expirada'));
    }

    // UUID-shape sanity check pra evitar SQL malformado mesmo passando
    // por parametro. UUID v4: 36 chars com dashes.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffId)) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }

    const role = await getCachedActiveStaffRole(this.tenantConn, staffId);

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
