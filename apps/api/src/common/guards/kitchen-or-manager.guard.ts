import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import { authErrorResponse } from './auth-error-response';
import { resolveAuthenticatedStaff } from './staff-auth-context';
import { getCachedActiveStaffRole } from './staff-role-cache';

/** Leitura/decisão da cozinha: cook e a hierarquia gerencial. */
@Injectable()
export class KitchenOrManagerGuard implements CanActivate {
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
      throw new ForbiddenException(
        authErrorResponse(
          'AUTH_PIN_CHANGE_REQUIRED',
          'Troca de PIN obrigatória antes de continuar.',
        ),
      );
    }
    if (resolved.error) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }
    const role = await getCachedActiveStaffRole(this.tenantConn, resolved.staffId);
    if (!role) {
      throw new UnauthorizedException(authErrorResponse('AUTH_INVALID', 'Sessão expirada'));
    }
    if (role !== 'cook' && role !== 'manager' && role !== 'owner') {
      throw new ForbiddenException(
        authErrorResponse('AUTH_FORBIDDEN', 'Acesso restrito à cozinha e à gerência'),
      );
    }
    return true;
  }
}
