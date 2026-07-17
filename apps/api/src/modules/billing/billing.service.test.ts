/**
 * P1 da auditoria 2026-07-03: a taxa de 10% só existia no frontend
 * (`SERVICE_RATE = 0.1` hardcoded) — `settings.service_fee_pct`
 * (migration 050) nunca era lida no backend e o POST /payments cobrava
 * SUM(total_cents) sem taxa: cliente via R$110 e pagava R$100.
 * O BillingService é a fonte única do cálculo.
 */

import { BillingService } from './billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * @param promotions linhas ativas retornadas pela query de promoções
 *   (default `[]` = nenhuma promoção qualifica → desconto 0).
 */
function fakeSettings(
  serviceFeePct: unknown | null,
  promotions: Array<Record<string, unknown>> = [],
) {
  const query = async (sql: string): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ');
    if (/SELECT service_fee_pct FROM settings/.test(s)) {
      return serviceFeePct === null ? [] : [{ service_fee_pct: serviceFeePct }];
    }
    if (/FROM promotions/.test(s)) {
      return promotions;
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
      discountCents: 0,
      discountLabel: null,
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

  it('subtotal em STRING (driver pg devolve SUM/NUMERIC assim) não vira concatenação', () => {
    const svc = new BillingService(fakeSettings('10.00'));
    // Bug real pego no E2E 2026-07-04: '790' + 79 = '79079' (R$790,79!)
    const totals = svc.applyServiceFee('790' as unknown as number, 10);
    expect(totals.subtotalCents).toBe(790);
    expect(totals.serviceFeeCents).toBe(79);
    expect(totals.totalCents).toBe(869);
  });

  it('taxa zero é permitida (restaurante sem serviço)', () => {
    const svc = new BillingService(fakeSettings('0'));
    expect(svc.applyServiceFee(10_000, 0)).toEqual({
      subtotalCents: 10_000,
      discountCents: 0,
      discountLabel: null,
      serviceFeePct: 0,
      serviceFeeCents: 0,
      totalCents: 10_000,
    });
  });

  it('computeTotals junta leitura + cálculo', async () => {
    const svc = new BillingService(fakeSettings('12.50'));
    expect(await svc.computeTotals(8_000)).toEqual({
      subtotalCents: 8_000,
      discountCents: 0,
      discountLabel: null,
      serviceFeePct: 12.5,
      serviceFeeCents: 1_000,
      totalCents: 9_000,
    });
  });
});

/**
 * FEATURE (Caleb 2026-07-05): promoções (migration 014) eram um CRUD MORTO —
 * o gerente criava "Terça 20% off", ficava ativa, e NUNCA reduzia a conta nem
 * aparecia pro cliente. Agora o BillingService é a fonte única do desconto,
 * autoritativo server-side, e todo caminho de conta (GET /orders/bill, POST
 * /payments, splits) herda o desconto pelo computeTotals.
 *
 * Semântica canônica: desconto sobre o SUBTOTAL, taxa DEPOIS (sobre o
 * subtotal já descontado); MELHOR promoção vence (sem empilhar); nunca fica
 * negativo; promoção fora da janela [valid_from, valid_until] é filtrada no
 * SQL e não aplica.
 */
describe('BillingService — desconto de promoção (feature)', () => {
  const PROMO_PCT_20 = {
    title: 'Terça 20% off',
    discount_type: 'percentage',
    discount_value: 20,
    min_order_cents: null,
  };

  it('promoção ativa de 20% reduz o subtotal ANTES da taxa (cobra 80%)', async () => {
    const svc = new BillingService(fakeSettings('10.00', [PROMO_PCT_20]));
    const totals = await svc.computeTotals(10_000);
    // subtotal 10.000 − 20% (2.000) = 8.000; taxa 10% sobre 8.000 = 800;
    // total = 8.800 (vs 11.000 sem promoção).
    expect(totals.subtotalCents).toBe(10_000);
    expect(totals.discountCents).toBe(2_000);
    expect(totals.discountLabel).toBe('Terça 20% off');
    expect(totals.serviceFeeCents).toBe(800);
    expect(totals.totalCents).toBe(8_800);
  });

  it('sem promoção ativa cobra cheio (desconto 0, label null)', async () => {
    const svc = new BillingService(fakeSettings('10.00', []));
    const totals = await svc.computeTotals(10_000);
    expect(totals.discountCents).toBe(0);
    expect(totals.discountLabel).toBeNull();
    expect(totals.totalCents).toBe(11_000);
  });

  it('promoção fixa em centavos desconta o valor fixo', async () => {
    const svc = new BillingService(
      fakeSettings('10.00', [
        { title: 'R$15 off', discount_type: 'fixed', discount_value: 1_500, min_order_cents: null },
      ]),
    );
    const totals = await svc.computeTotals(10_000);
    // 10.000 − 1.500 = 8.500; taxa 10% = 850; total = 9.350.
    expect(totals.discountCents).toBe(1_500);
    expect(totals.totalCents).toBe(9_350);
  });

  it('min_order_cents não atingido → promoção não aplica', async () => {
    const svc = new BillingService(
      fakeSettings('10.00', [
        {
          title: 'Acima de R$100',
          discount_type: 'percentage',
          discount_value: 20,
          min_order_cents: 10_000,
        },
      ]),
    );
    const totals = await svc.computeTotals(5_000); // 50 < 100 mínimo
    expect(totals.discountCents).toBe(0);
    expect(totals.discountLabel).toBeNull();
    expect(totals.totalCents).toBe(5_500);
  });

  it('MELHOR promoção vence: entre 10% e 30%, aplica a de 30% (sem empilhar)', async () => {
    const svc = new BillingService(
      fakeSettings('10.00', [
        {
          title: '10% off',
          discount_type: 'percentage',
          discount_value: 10,
          min_order_cents: null,
        },
        {
          title: '30% off',
          discount_type: 'percentage',
          discount_value: 30,
          min_order_cents: null,
        },
      ]),
    );
    const totals = await svc.computeTotals(10_000);
    // vence a de 30% → desconto 3.000 (não 4.000 empilhado); taxa sobre 7.000
    // = 700; total 7.700.
    expect(totals.discountCents).toBe(3_000);
    expect(totals.discountLabel).toBe('30% off');
    expect(totals.totalCents).toBe(7_700);
  });

  it('desconto nunca deixa o total negativo (clamp no subtotal)', async () => {
    const svc = new BillingService(
      fakeSettings('10.00', [
        {
          title: 'R$999 off',
          discount_type: 'fixed',
          discount_value: 99_900,
          min_order_cents: null,
        },
      ]),
    );
    const totals = await svc.computeTotals(5_000);
    // desconto fixo maior que o subtotal → clampa em 5.000; total = 0.
    expect(totals.discountCents).toBe(5_000);
    expect(totals.totalCents).toBe(0);
  });

  it('a janela é filtrada no SQL: uma promoção fora do horário simplesmente não volta', async () => {
    // O fake devolve [] (nenhuma promoção ativa AGORA) simulando o filtro
    // now() BETWEEN valid_from AND valid_until do resolveDiscount. Fora da
    // janela → sem desconto → cobra cheio.
    const svc = new BillingService(fakeSettings('10.00', []));
    const totals = await svc.computeTotals(10_000);
    expect(totals.discountCents).toBe(0);
    expect(totals.totalCents).toBe(11_000);
  });
});
