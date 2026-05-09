import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Module({
  imports: [TenantModule],
  controllers: [VipController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado pro DI lookup.
  providers: [VipService, ManagerOnlyGuard],
  exports: [VipService],
})
export class VipModule {}
