import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ZonePauseController } from './zone-pause.controller';
import { ZonePauseService } from './zone-pause.service';

@Module({
  // Round 10 (B-NEW-49): CallerResolverModule pra resolver staffId.
  imports: [TenantModule, CallerResolverModule],
  controllers: [ZonePauseController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado pro DI lookup.
  providers: [ZonePauseService, ManagerOnlyGuard],
  exports: [ZonePauseService],
})
export class ZonePauseModule {}
