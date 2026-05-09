import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
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
  providers: [HostService],
  exports: [HostService],
})
export class HostModule {}
