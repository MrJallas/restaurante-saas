import { Module } from '@nestjs/common';
import { CustomersModule } from '../../modules/customers/customers.module';
import { TenantModule } from '../../modules/tenant/tenant.module';
import { CallerResolverService } from './caller-resolver.service';

/**
 * Round 8 (B-NEW-27): expõe `CallerResolverService` como provider
 * compartilhado. Cada module que precisa resolver customerId do
 * cookie importa este module.
 *
 *   imports: [CallerResolverModule]
 *   constructor(private callerResolver: CallerResolverService) {}
 *
 * Round 11 (B-NEW-56b): TenantModule importado pra DI do
 * TenantConnectionProvider em `requireActiveStaffId`.
 */
@Module({
  imports: [CustomersModule, TenantModule],
  providers: [CallerResolverService],
  exports: [CallerResolverService],
})
export class CallerResolverModule {}
