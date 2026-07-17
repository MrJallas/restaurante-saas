import { Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';

const SESSION = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BETO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const VISIT_ANA = '22222222-2222-4222-8222-22222222222a';

interface PaymentRow {
  id: string;
  status: 'pending' | 'expired';
  amount_cents: number;
  visit_id: string | null;
  split_mode: string | null;
  method: string;
  expires_at: string | null;
  split_allocations: unknown;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  created_at: string;
}

function fakeDb(seed: PaymentRow[] = []) {
  const payments = [...seed];
  const pendingSelects: string[] = [];

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: '0' }];
    }
    if (s.includes('FROM promotions')) return [];
    if (s.startsWith('SELECT id FROM visits')) {
      return params[0] === SESSION && params[1] === ANA ? [{ id: VISIT_ANA }] : [];
    }
    if (s.includes('FROM session_participants')) {
      return [{ customer_id: ANA }, { customer_id: BETO }];
    }
    if (s.includes('FROM order_items oi')) {
      return [
        { subtotal_cents: 5_000, customer_id: ANA },
        { subtotal_cents: 5_000, customer_id: BETO },
      ];
    }
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      return [{ total: s.includes(`billing_mode = 'individual'`) ? '5000' : '10000' }];
    }
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)') && s.includes(`status = 'pending'`)) {
      const pending = payments
        .filter(
          (p) =>
            p.status === 'pending' &&
            (p.visit_id === null || p.split_mode !== null) &&
            (!p.expires_at || new Date(p.expires_at).getTime() > Date.now()),
        )
        .reduce((sum, p) => sum + p.amount_cents, 0);
      return [{ pending: String(pending) }];
    }
    if (s.startsWith('SELECT COALESCE(SUM(amount_cents)')) return [{ paid: '0' }];

    if (s.startsWith('SELECT id, expires_at FROM payments')) {
      pendingSelects.push(s);
      const visitId = params[1] as string | undefined;
      return payments
        .filter((p) => {
          if (p.status !== 'pending') return false;
          if (s.includes('visit_id IS NULL')) return p.visit_id === null;
          if (s.includes('split_mode IS NOT NULL')) {
            return p.visit_id === visitId && p.split_mode !== null;
          }
          if (s.includes('split_mode IS NULL')) {
            return p.visit_id === visitId && p.split_mode === null;
          }
          throw new Error(`Dedup sem cerca explícita: ${s}`);
        })
        .map((p) => ({ id: p.id, expires_at: p.expires_at }));
    }
    if (s.startsWith('SELECT id, status, amount_cents, method')) {
      const row = payments.find(
        (p) => p.id === params[0] && p.status === 'pending' && params[1] === SESSION,
      );
      return row ? [row] : [];
    }
    if (s.startsWith(`UPDATE payments SET status = 'expired'`)) {
      const row = payments.find((p) => p.id === params[0]);
      if (row) row.status = 'expired';
      return [];
    }
    if (s.startsWith('INSERT INTO payments')) {
      const id = `pay-${payments.length + 1}`;
      const row: PaymentRow = {
        id,
        status: 'pending',
        amount_cents: params[2] as number,
        visit_id: (params[1] as string | null) ?? null,
        split_mode: (params[7] as string | null) ?? null,
        method: params[3] as string,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        split_allocations: params[8] ?? null,
        pix_qr_code: params[4] as string | null,
        pix_copy_paste: params[5] as string | null,
        created_at: '2026-07-11T00:00:00.000Z',
      };
      payments.push(row);
      return [row];
    }
    throw new Error(`fake payment recovery: SQL não roteado: ${s}`);
  };

  return {
    payments,
    pendingSelects,
    conn: { query } as unknown as TenantConnectionProvider,
  };
}

function redisWithOwnedLock(opts: { cleanupFails?: boolean } = {}) {
  const locks = new Map<string, string>();
  return {
    setNX: jest.fn(async (key: string, owner: string) => {
      if (locks.has(key)) return false;
      locks.set(key, owner);
      return true;
    }),
    compareAndDelete: jest.fn(async (key: string, owner: string) => {
      if (opts.cleanupFails) throw new Error('redis unavailable');
      if (locks.get(key) !== owner) return false;
      locks.delete(key);
      return true;
    }),
    get: jest.fn(async (key: string) => locks.get(key) ?? null),
    del: jest.fn(async (key: string) => locks.delete(key)),
  };
}

function payment(overrides: Partial<PaymentRow>): PaymentRow {
  return {
    id: 'pending-1',
    status: 'pending',
    amount_cents: 5_000,
    visit_id: VISIT_ANA,
    split_mode: null,
    method: 'pix',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    split_allocations: null,
    pix_qr_code: 'existing-qr',
    pix_copy_paste: 'existing-qr',
    created_at: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('PaymentsService — dedup por escopo financeiro', () => {
  it('pending individual (split_mode NULL) não bloqueia split da mesma visita', async () => {
    const db = fakeDb([payment({ split_mode: null })]);
    const redis = redisWithOwnedLock();
    const service = new PaymentsService(
      db.conn,
      redis as unknown as RedisService,
      new BillingService(db.conn),
    );

    const result = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
      splitMode: 'equal',
      allocations: [{ customerId: ANA, amountCents: 5_000 }],
    });

    expect(result.paymentId).not.toBe('pending-1');
    expect(db.payments.some((p) => p.visit_id === VISIT_ANA && p.split_mode === 'equal')).toBe(
      true,
    );
    expect(db.pendingSelects.at(-1)).toContain('split_mode IS NOT NULL');
  });

  it('pending split (split_mode IS NOT NULL) não bloqueia comanda individual da mesma visita', async () => {
    const db = fakeDb([payment({ split_mode: 'equal' })]);
    const redis = redisWithOwnedLock();
    const service = new PaymentsService(
      db.conn,
      redis as unknown as RedisService,
      new BillingService(db.conn),
    );

    const result = await service.requestPayment(SESSION, null, 'individual', 'pix', {
      callerCustomerId: ANA,
    });

    expect(result.paymentId).not.toBe('pending-1');
    expect(
      db.payments.filter((p) => p.visit_id === VISIT_ANA && p.split_mode === null),
    ).toHaveLength(1);
    expect(db.pendingSelects.at(-1)).toContain('split_mode IS NULL');
  });

  it('scope table usa somente visit_id IS NULL', async () => {
    const db = fakeDb([payment({ split_mode: null })]);
    const redis = redisWithOwnedLock();
    const service = new PaymentsService(
      db.conn,
      redis as unknown as RedisService,
      new BillingService(db.conn),
    );

    await service.requestPayment(SESSION, VISIT_ANA, 'table', 'pix');

    const scopeSql = db.pendingSelects.at(-1) ?? '';
    expect(scopeSql).toContain('visit_id IS NULL');
    expect(scopeSql).not.toContain('split_mode IS');
  });
});

describe('PaymentsService — cleanup Redis e recovery idempotente', () => {
  afterEach(() => jest.restoreAllMocks());

  it('INSERT bem-sucedido continua 200 se compareAndDelete falhar; retry recupera o mesmo pending', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = fakeDb();
    const redis = redisWithOwnedLock({ cleanupFails: true });
    const service = new PaymentsService(
      db.conn,
      redis as unknown as RedisService,
      new BillingService(db.conn),
    );

    const first = await service.requestPayment(SESSION, null, 'table', 'pix');
    expect(first).toMatchObject({ paymentId: 'pay-1', status: 'pending', amountCents: 10_000 });
    expect(db.payments).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cleanup best-effort'));

    // O lock ficou no Redis porque o cleanup falhou. Mesmo assim, a segunda
    // tentativa encontra a row pending no mesmo scope e devolve o mesmo QR/id.
    const retry = await service.requestPayment(SESSION, null, 'table', 'pix');
    expect(retry).toMatchObject({
      paymentId: first.paymentId,
      status: 'pending',
      amountCents: first.amountCents,
      pixCopyPaste: first.pixCopyPaste,
    });
    expect(db.payments).toHaveLength(1);
    expect(redis.setNX).toHaveBeenCalledTimes(2);
  });
});
