import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantRequest } from '../../modules/tenant/tenant.middleware';

export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<TenantRequest>();
  return request.tenantSchemaName!;
});
