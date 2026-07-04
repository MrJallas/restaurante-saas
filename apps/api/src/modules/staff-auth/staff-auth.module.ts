import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { TenantModule } from '../tenant/tenant.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffPinAdminController } from './staff-pin-admin.controller';
import { StaffAuthService } from './staff-auth.service';
import { RecoveryThrottleGuard } from './recovery-throttle.guard';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [StaffAuthController, StaffPinAdminController],
  providers: [StaffAuthService, RecoveryThrottleGuard],
})
export class StaffAuthModule {}
