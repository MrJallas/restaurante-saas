import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OwnerOnlyGuard } from '../../common/guards/owner-only.guard';

@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [SettingsController],
  providers: [SettingsService, OwnerOnlyGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
