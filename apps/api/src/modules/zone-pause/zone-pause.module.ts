import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { ZonePauseController } from './zone-pause.controller';
import { ZonePauseService } from './zone-pause.service';

@Module({
  imports: [TenantModule],
  controllers: [ZonePauseController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado pro DI lookup.
  providers: [ZonePauseService, ManagerOnlyGuard],
  exports: [ZonePauseService],
})
export class ZonePauseModule {}
