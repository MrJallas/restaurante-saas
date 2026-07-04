import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { AlertsModule } from '../alerts/alerts.module';
import { HostAssistController } from './host-assist.controller';
import { HostController } from './host.controller';
import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';

/**
 * Staff-host module · backend de Mapa + Inbox + Liberate + Swap + VIP via
 * TableMenu + Waitlist + Reservations. Fechamento do P0 #11 ("Modulo host
 * nao existe no backend"). Os endpoints aqui ficam todos sob `:slug/host/*`
 * (FE em `apps/web-staff/src/lib/api/host.ts`).
 *
 * HostAssistController é a exceção customer-side (SessionGuard): cliente
 * pede a recepção na mesa (`POST /:slug/host/assist`) — AlertsModule
 * fornece a persistência do alerta visível pro papel host.
 */
@Module({
  // Round 11 (B-NEW-56): CallerResolverModule pra requireStaffId.
  // RedisModule: SessionGuard (HostAssistController) depende de RedisService.
  imports: [TenantModule, RedisModule, CallerResolverModule, AlertsModule],
  controllers: [HostController, HostAssistController],
  // Round 9 (B-NEW-33): HostOrManagerGuard registrado como provider pra
  // que Nest possa injetar TenantConnectionProvider (DI deps do guard).
  providers: [
    HostService,
    HostInboxService,
    HostWaitlistService,
    HostReservationsService,
    HostOrManagerGuard,
  ],
  exports: [HostService],
})
export class HostModule {}
