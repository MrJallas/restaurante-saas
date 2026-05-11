import { Module, forwardRef } from '@nestjs/common';
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
 *
 * Round 18 (P0 runtime fix): `forwardRef(() => CustomersModule)` quebra
 * o ciclo `CustomersModule → TableSessionModule → CallerResolverModule
 * → CustomersModule`. Sem isso NestJS não instancia CustomersModule no
 * boot (imports[1] = undefined porque TableSessionModule ainda está em
 * meio a resolução). Round 8 introduziu o ciclo ao adicionar
 * CallerResolverModule e rounds 9-17 não notaram porque audits foram
 * estáticos — `npm run lint` + `tsc` não detectam circular module
 * deps em NestJS.
 */
@Module({
  imports: [forwardRef(() => CustomersModule), TenantModule],
  providers: [CallerResolverService],
  exports: [CallerResolverService],
})
export class CallerResolverModule {}
