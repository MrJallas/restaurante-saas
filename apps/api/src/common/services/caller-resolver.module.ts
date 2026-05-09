import { Module } from '@nestjs/common';
import { CustomersModule } from '../../modules/customers/customers.module';
import { CallerResolverService } from './caller-resolver.service';

/**
 * Round 8 (B-NEW-27): expõe `CallerResolverService` como provider
 * compartilhado. Cada module que precisa resolver customerId do
 * cookie importa este module.
 *
 *   imports: [CallerResolverModule]
 *   constructor(private callerResolver: CallerResolverService) {}
 */
@Module({
  imports: [CustomersModule],
  providers: [CallerResolverService],
  exports: [CallerResolverService],
})
export class CallerResolverModule {}
