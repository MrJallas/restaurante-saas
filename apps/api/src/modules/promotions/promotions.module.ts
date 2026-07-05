import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

@Module({
  imports: [TenantModule],
  controllers: [PromotionsController],
  // Round 8 (B-NEW-*): ManagerOnlyGuard registrado pro DI lookup — as
  // mutações POST/PATCH/DELETE compõem (StaffOnlyGuard, ManagerOnlyGuard).
  providers: [PromotionsService, ManagerOnlyGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
