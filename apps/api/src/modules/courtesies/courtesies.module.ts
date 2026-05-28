import { Module } from '@nestjs/common';
import { CourtesiesController, CustomerCourtesiesController } from './courtesies.controller';
import { CourtesiesService } from './courtesies.service';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

/**
 * Round 18 (Onda 1 wiring): persistencia das cortesias do manager.
 * Endpoints `GET /:slug/staff/courtesies` (lista pra
 * ScreenManagerCourtesies) + `POST /:slug/staff/courtesies` (criar
 * via compensate-client) + `POST /:slug/staff/courtesies/:id/respond`
 * (registrar aceite/recusa).
 */
@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [CourtesiesController, CustomerCourtesiesController],
  providers: [CourtesiesService, ManagerOnlyGuard],
  exports: [CourtesiesService],
})
export class CourtesiesModule {}
