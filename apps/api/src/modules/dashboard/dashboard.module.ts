import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AlertsModule } from '../alerts/alerts.module';
import { WaiterWorkloadService } from './waiter-workload.service';

@Module({
  imports: [TenantModule, RedisModule, AlertsModule],
  controllers: [DashboardController],
  providers: [DashboardService, WaiterWorkloadService, StaffOrSessionGuard],
})
export class DashboardModule {}
