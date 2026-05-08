import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ComplaintsModule } from '../complaints/complaints.module';
import { OrderRatingsController } from './order-ratings.controller';
import { OrderRatingsService } from './order-ratings.service';

@Module({
  imports: [TenantModule, RedisModule, ComplaintsModule],
  controllers: [OrderRatingsController],
  providers: [OrderRatingsService],
  exports: [OrderRatingsService],
})
export class OrderRatingsModule {}
