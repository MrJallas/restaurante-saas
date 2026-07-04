import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/** Totais de conta com a taxa de serviço server-side (migration 050). */
export interface BillTotals {
  subtotalCents: number;
  serviceFeePct: number;
  serviceFeeCents: number;
  totalCents: number;
}

@Injectable()
export class BillingService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  /**
   * Lê `settings.service_fee_pct` (NUMERIC(5,2) — o pg devolve string).
   * Valor ausente/inválido cai no default 10 (mesmo da migration 050),
   * nunca em taxa negativa.
   */
  async getServiceFeePct(): Promise<number> {
    const rows = (await this.tenantConn.query(
      `SELECT service_fee_pct FROM settings LIMIT 1`,
    )) as Array<{ service_fee_pct: unknown }>;
    const pct = Number(rows[0]?.service_fee_pct);
    return Number.isFinite(pct) && pct >= 0 ? pct : 10;
  }

  applyServiceFee(subtotalCents: number, serviceFeePct: number): BillTotals {
    const serviceFeeCents = Math.round((subtotalCents * serviceFeePct) / 100);
    return {
      subtotalCents,
      serviceFeePct,
      serviceFeeCents,
      totalCents: subtotalCents + serviceFeeCents,
    };
  }

  async computeTotals(subtotalCents: number): Promise<BillTotals> {
    return this.applyServiceFee(subtotalCents, await this.getServiceFeePct());
  }
}
