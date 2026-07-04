/**
 * P1 da auditoria 2026-07-03: a taxa de 10% só existia no frontend
 * (`SERVICE_RATE = 0.1` hardcoded) — `settings.service_fee_pct`
 * (migration 050) nunca era lida no backend e o POST /payments cobrava
 * SUM(total_cents) sem taxa: cliente via R$110 e pagava R$100.
 * O BillingService é a fonte única do cálculo.
 */

import { BillingService } from './billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

function fakeSettings(serviceFeePct: unknown | null) {
  const query = async (sql: string): Promise<unknown[]> => {
    if (/SELECT service_fee_pct FROM settings/.test(sql.replace(/\s+/g, ' '))) {
      return serviceFeePct === null ? [] : [{ service_fee_pct: serviceFeePct }];
    }
    throw new Error(`fake settings: SQL não roteado: ${sql}`);
  };
  return { query } as unknown as TenantConnectionProvider;
}

describe('BillingService', () => {
  it('lê service_fee_pct das settings (NUMERIC chega como string do pg)', async () => {
    const svc = new BillingService(fakeSettings('10.00'));
    expect(await svc.getServiceFeePct()).toBe(10);
  });

  it('taxa configurada diferente do default é respeitada', async () => {
    const svc = new BillingService(fakeSettings('12.50'));
    expect(await svc.getServiceFeePct()).toBe(12.5);
  });

  it('sem row de settings cai no default 10 (mesma da migration)', async () => {
    const svc = new BillingService(fakeSettings(null));
    expect(await svc.getServiceFeePct()).toBe(10);
  });

  it('valor não-numérico ou negativo cai no default 10', async () => {
    expect(await new BillingService(fakeSettings('abc')).getServiceFeePct()).toBe(10);
    expect(await new BillingService(fakeSettings('-5')).getServiceFeePct()).toBe(10);
  });

  it('applyServiceFee: 10% de R$100,00 → total R$110,00', () => {
    const svc = new BillingService(fakeSettings('10.00'));
    expect(svc.applyServiceFee(10_000, 10)).toEqual({
      subtotalCents: 10_000,
      serviceFeePct: 10,
      serviceFeeCents: 1_000,
      totalCents: 11_000,
    });
  });

  it('applyServiceFee arredonda meio centavo pra cima (Math.round)', () => {
    const svc = new BillingService(fakeSettings('10.00'));
    // 10% de 105 = 10.5 → 11
    expect(svc.applyServiceFee(105, 10).serviceFeeCents).toBe(11);
    expect(svc.applyServiceFee(105, 10).totalCents).toBe(116);
  });

  it('taxa zero é permitida (restaurante sem serviço)', () => {
    const svc = new BillingService(fakeSettings('0'));
    expect(svc.applyServiceFee(10_000, 0)).toEqual({
      subtotalCents: 10_000,
      serviceFeePct: 0,
      serviceFeeCents: 0,
      totalCents: 10_000,
    });
  });

  it('computeTotals junta leitura + cálculo', async () => {
    const svc = new BillingService(fakeSettings('12.50'));
    expect(await svc.computeTotals(8_000)).toEqual({
      subtotalCents: 8_000,
      serviceFeePct: 12.5,
      serviceFeeCents: 1_000,
      totalCents: 9_000,
    });
  });
});
