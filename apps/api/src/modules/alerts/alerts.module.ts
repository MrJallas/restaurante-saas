import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';

/**
 * Round 18 (Onda 4 batch 2): persistencia de alertas operacionais
 * (escalations, zone-pause overruns, complaints overdue, qr-issues
 * critical). Endpoints `GET /:slug/alerts`, `POST /:slug/alerts/:id/dismiss`,
 * `POST /:slug/alerts/:id/resolve`.
 *
 * Migration 045 cria a tabela `alerts`. EventsGateway é Global
 * (WebsocketModule @Global), entao nao precisa importar aqui.
 */
@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [AlertsController],
  providers: [AlertsService, ManagerOnlyGuard],
  exports: [AlertsService],
})
export class AlertsModule {}
