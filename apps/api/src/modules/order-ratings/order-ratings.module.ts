import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ComplaintsModule } from '../complaints/complaints.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { OrderRatingsController } from './order-ratings.controller';
import { OrderRatingsService } from './order-ratings.service';

@Module({
  // Round 8 (B-NEW-27): CallerResolverModule.
  imports: [TenantModule, RedisModule, ComplaintsModule, CallerResolverModule],
  controllers: [OrderRatingsController],
  providers: [OrderRatingsService],
  exports: [OrderRatingsService],
})
export class OrderRatingsModule {}
