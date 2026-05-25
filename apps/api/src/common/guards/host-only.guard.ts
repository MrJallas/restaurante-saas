import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { getCachedActiveStaffRole } from './staff-role-cache';

/**
 * Host-or-manager guard · second layer on top of `StaffOnlyGuard`.
 *
 * Round 9 (B-NEW-33) hardening — espelha o fix do `ManagerOnlyGuard` no
 * round 7. Antes confiava em `x-staff-role` header CLIENT-CONTROLLED;
 * qualquer waiter com `x-staff-key` setava `x-staff-role: host` e
 * bypassa todo o módulo host (waitlist, reservations, swap, liberate,
 * VIP via TableMenu).
 *
 * AGORA: lê `x-staff-id` (UUID v4 sanitized), faz `SELECT role FROM
 * staff WHERE id = $1 AND is_active = true`, aceita `role IN ('host',
 * 'manager')`. Manager pode tudo que host pode (canon do projeto).
 *
 * Compose com `@UseGuards(StaffOnlyGuard, HostOrManagerGuard)` — o
 * StaffOnlyGuard valida `x-staff-key` shared secret antes.
 */
@Injectable()
export class HostOrManagerGuard implements CanActivate {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const staffIdHeader = req.headers['x-staff-id'];
    const staffId = Array.isArray(staffIdHeader) ? staffIdHeader[0] : staffIdHeader;

    if (!staffId || typeof staffId !== 'string') {
      throw new UnauthorizedException(
        'host-or-manager endpoint exige x-staff-id',
      );
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        staffId,
      )
    ) {
      throw new UnauthorizedException('x-staff-id inválido');
    }

    const role = await getCachedActiveStaffRole(this.tenantConn, staffId);

    if (!role) {
      throw new ForbiddenException('staff não encontrado ou inativo');
    }

    if (role !== 'host' && role !== 'manager') {
      throw new ForbiddenException('host- or manager-only endpoint');
    }

    return true;
  }
}
