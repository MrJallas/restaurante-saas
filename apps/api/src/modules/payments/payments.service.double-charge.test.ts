/**
 * P1-A do re-scan 2026-07-04 (cluster de dinheiro): a conta NÃO subtraía o
 * já-pago. O outstanding era SUM(orders) puro; o dedup só bloqueava um
 * pagamento `pending`. Consequência: pagamento confirmado/awaiting_settlement
 * NÃO reduzia o devido nem barrava um novo request → um 2º POST /payments
 * re-cobrava a conta INTEIRA (double-charge no dia que o PSP plugar).
 *
 * Fix: outstanding = billTotal - SUM(amount_cents dos pagamentos já em
 * confirmed/paid/awaiting_settlement no mesmo escopo). <=0 → "nada pendente".
 */

import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const VISIT = '22222222-2222-4222-8222-222222222222';

function fakeRedis(): RedisService {
  const store = new Map<string, string>();
  return {
    setNX: async (k: string, v: string) => {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => void store.delete(k),
  } as unknown as RedisService;
}

function fakeDb(opts: {
  tableSubtotal?: number;
  individualSubtotal?: number;
  settledForTable?: number; // já pago no escopo da MESA (visit_id NULL)
  settledForVisit?: number; // já pago no escopo da MINHA visita
  visitForCustomer?: Record<string, string>;
}) {
  const inserts: Array<{ params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) return [{ service_fee_pct: '10.00' }];
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      return s.includes(`billing_mode = 'individual'`)
        ? [{ total: String(opts.individualSubtotal ?? 0) }]
        : [{ total: String(opts.tableSubtotal ?? 0) }];
    }
    // NOVO: soma dos pagamentos já liquidados/aguardando no escopo
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) {
      const scoped = s.includes('visit_id IS NULL') ? opts.settledForTable : opts.settledForVisit;
      return [{ paid: String(scoped ?? 0) }];
    }
    if (s.startsWith('SELECT id FROM visits')) {
      const v = opts.visitForCustomer?.[params[1] as string];
      return v ? [{ id: v }] : [];
    }
    if (s.includes('FROM payments') && s.includes(`status = 'pending'`)) return [];
    if (s.startsWith('INSERT INTO payments')) {
      inserts.push({ params });
      return [
        {
          id: 'pay-1',
          status: 'pending',
          amount_cents: params[2],
          method: params[3],
          pix_qr_code: params[4],
          pix_copy_paste: params[5],
          expires_at: null,
          split_mode: params[7],
          split_allocations: params[8],
          created_at: '2026-07-04T00:00:00Z',
        },
      ];
    }
    throw new Error(`fake payments: SQL não roteado: ${s.slice(0, 90)}`);
  };
  const conn = { query } as unknown as TenantConnectionProvider;
  return { conn, inserts };
}

function make(opts: Parameters<typeof fakeDb>[0]) {
  const db = fakeDb(opts);
  return { service: new PaymentsService(db.conn, fakeRedis(), new BillingService(db.conn)), db };
}

describe('PaymentsService.requestPayment — não re-cobra o já-pago (P1-A)', () => {
  it('mesa: conta 10000 (+10% = 11000) já quitada → recusa novo pagamento', async () => {
    const { service } = make({ tableSubtotal: 10_000, settledForTable: 11_000 });
    await expect(service.requestPayment(SESSION, null, 'table', 'pix')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('mesa: pago parcial 5000 de 11000 → cobra só o saldo 6000', async () => {
    const { service, db } = make({ tableSubtotal: 10_000, settledForTable: 5_000 });
    await service.requestPayment(SESSION, null, 'table', 'pix');
    // params[2] = amount_cents do INSERT
    expect(db.inserts[0].params[2]).toBe(6_000);
  });

  it('mesa: nada pago → cobra o total cheio (comportamento preservado)', async () => {
    const { service, db } = make({ tableSubtotal: 10_000, settledForTable: 0 });
    await service.requestPayment(SESSION, null, 'table', 'pix');
    expect(db.inserts[0].params[2]).toBe(11_000);
  });

  it('individual: minha comanda já quitada → recusa', async () => {
    const { service } = make({
      individualSubtotal: 8_000, // +10% = 8800
      settledForVisit: 8_800,
      visitForCustomer: { [CUSTOMER]: VISIT },
    });
    await expect(
      service.requestPayment(SESSION, null, 'individual', 'pix', { callerCustomerId: CUSTOMER }),
    ).rejects.toThrow(BadRequestException);
  });
});
