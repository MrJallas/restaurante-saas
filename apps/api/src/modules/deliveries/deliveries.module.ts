import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, StaffOrSessionGuard],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
