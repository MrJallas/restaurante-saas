import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';
import { HostController } from './host.controller';
import { HostService } from './host.service';

/**
 * Staff-host module · backend de Mapa + Inbox + Liberate + Swap + VIP via
 * TableMenu + Waitlist + Reservations. Fechamento do P0 #11 ("Modulo host
 * nao existe no backend"). Os endpoints aqui ficam todos sob `:slug/host/*`
 * (FE em `apps/web-staff/src/lib/api/host.ts`).
 */
@Module({
  imports: [TenantModule],
  controllers: [HostController],
  // Round 9 (B-NEW-33): HostOrManagerGuard registrado como provider pra
  // que Nest possa injetar TenantConnectionProvider (DI deps do guard).
  providers: [HostService, HostOrManagerGuard],
  exports: [HostService],
})
export class HostModule {}
