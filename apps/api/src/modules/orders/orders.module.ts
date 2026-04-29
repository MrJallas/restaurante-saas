import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [OrdersController],
  providers: [OrdersService, StaffOrSessionGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
