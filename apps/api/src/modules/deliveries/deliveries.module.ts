import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  // Round 16 (P3-NEW-1): CallerResolverModule pra resolver staffId
  // (com cross-check em DB via requireActiveStaffId) em claim/markDelivered.
  imports: [TenantModule, RedisModule, CallerResolverModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, StaffOrSessionGuard],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
