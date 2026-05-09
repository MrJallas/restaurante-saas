import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Module({
  // Round 10 (B-NEW-49): CallerResolverModule pra resolver staffId.
  imports: [TenantModule, CallerResolverModule],
  controllers: [VipController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado pro DI lookup.
  providers: [VipService, ManagerOnlyGuard],
  exports: [VipService],
})
export class VipModule {}
