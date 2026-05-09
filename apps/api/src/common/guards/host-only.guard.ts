import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Host-only guard · second layer on top of `StaffOnlyGuard`.
 *
 * `StaffOnlyGuard` already validates the `x-staff-key` shared secret. This
 * guard adds a per-role check via the `x-staff-role` header, similar to
 * `ManagerOnlyGuard`. Endpoints in the host module accept either `host` or
 * `manager` (managers also tem visibilidade do recepcionista; nao faz sentido
 * bloquear gerente de liberar uma mesa que o recepcionista poderia liberar).
 *
 * Compose com `@UseGuards(StaffOnlyGuard, HostOrManagerGuard)`.
 */
@Injectable()
export class HostOrManagerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const role = req.headers['x-staff-role'];
    if (role !== 'host' && role !== 'manager') {
      throw new ForbiddenException('host- or manager-only endpoint');
    }
    return true;
  }
}
