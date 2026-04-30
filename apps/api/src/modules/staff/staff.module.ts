import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [StaffController],
  providers: [StaffService, StaffOrSessionGuard],
  exports: [StaffService],
})
export class StaffModule {}
