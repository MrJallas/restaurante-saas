import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { BillingModule } from '../billing/billing.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  // Round 11 (B-NEW-42): RedisModule pra SETNX lock idempotency.
  imports: [TenantModule, RedisModule, BillingModule, CallerResolverModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
