import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { WaiterCallsController } from './waiter-calls.controller';
import { WaiterCallsService } from './waiter-calls.service';

@Module({
  // Round 8 (B-NEW-27): CallerResolverModule.
  imports: [TenantModule, RedisModule, CallerResolverModule],
  controllers: [WaiterCallsController],
  providers: [WaiterCallsService, StaffOrSessionGuard],
  exports: [WaiterCallsService],
})
export class WaiterCallsModule {}
