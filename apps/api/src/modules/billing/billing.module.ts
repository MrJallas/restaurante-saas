import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { BillingService } from './billing.service';

/**
 * Serviço de "Conta" único (auditoria 2026-07-03 / plano §6-M): a taxa de
 * serviço vive AQUI, lida de `settings.service_fee_pct` (migration 050).
 * `GET /orders/bill` (exibição) e `POST /payments` (cobrança) consomem o
 * mesmo cálculo — o FE nunca mais inventa taxa.
 */
@Module({
  imports: [TenantModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
