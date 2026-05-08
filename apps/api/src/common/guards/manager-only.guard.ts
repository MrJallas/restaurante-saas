import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Manager-only guard · second layer on top of `StaffOnlyGuard`.
 *
 * `StaffOnlyGuard` already validates the `x-staff-key` shared secret. This
 * guard adds a per-role check via the `x-staff-role` header, which the staff
 * apps must send when calling endpoints reserved to managers (start/end zone
 * pause, respond to a complaint, toggle session VIP/allergy flags).
 *
 * Compose with `@UseGuards(StaffOnlyGuard, ManagerOnlyGuard)` so the request
 * is rejected before reaching the role check when the shared secret is
 * missing or invalid.
 */
@Injectable()
export class ManagerOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const role = req.headers['x-staff-role'];
    if (role !== 'manager') {
      throw new ForbiddenException('manager-only endpoint');
    }
    return true;
  }
}
