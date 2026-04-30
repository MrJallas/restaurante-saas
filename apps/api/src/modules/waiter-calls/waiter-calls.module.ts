import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { WaiterCallsController } from './waiter-calls.controller';
import { WaiterCallsService } from './waiter-calls.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [WaiterCallsController],
  providers: [WaiterCallsService, StaffOrSessionGuard],
  exports: [WaiterCallsService],
})
export class WaiterCallsModule {}
