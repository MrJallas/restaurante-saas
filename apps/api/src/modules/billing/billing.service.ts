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
    // O driver do pg devolve SUM()/NUMERIC como STRING — sem coerção,
    // `'790' + 79` vira '79079' (concatenação; conta de R$790,79). O
    // Number() aqui blinda TODOS os call sites que passam agregados do DB.
    const subtotal = Number(subtotalCents) || 0;
    const serviceFeeCents = Math.round((subtotal * serviceFeePct) / 100);
    return {
      subtotalCents: subtotal,
      serviceFeePct,
      serviceFeeCents,
      totalCents: subtotal + serviceFeeCents,
    };
  }

  async computeTotals(subtotalCents: number): Promise<BillTotals> {
    return this.applyServiceFee(subtotalCents, await this.getServiceFeePct());
  }
}
