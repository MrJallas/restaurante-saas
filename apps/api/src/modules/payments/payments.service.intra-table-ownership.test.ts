import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SESSION = '11111111-1111-4111-8111-111111111111';
const VISIT_B = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAYMENT = '33333333-3333-4333-8333-333333333333';

type PaymentScope = 'table' | 'individual' | 'split';

function makeService(scope: PaymentScope) {
  const state = {
    status: 'pending',
    mutations: 0,
  };

  const query = jest.fn(async (sql: string): Promise<unknown[]> => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.includes('FROM payments p') && normalized.includes('WHERE p.id = $1')) {
      return [
        {
          id: PAYMENT,
          status: state.status,
          table_session_id: SESSION,
          expires_at: null,
          amount_cents: 5_000,
          method: 'pix',
          split_mode: scope === 'split' ? 'equal' : null,
          visit_id: scope === 'table' ? null : VISIT_B,
          owner_customer_id: scope === 'table' ? null : CUSTOMER_B,
        },
      ];
    }
    if (normalized.startsWith('UPDATE payments')) {
      state.mutations += 1;
      if (normalized.includes("status = 'cancelled'")) state.status = 'cancelled';
      else if (normalized.includes("status = 'confirmed'")) state.status = 'confirmed';
      else if (normalized.includes("status = 'awaiting_settlement'")) {
        state.status = 'awaiting_settlement';
      }
      return normalized.includes('RETURNING paid_at') ? [{ paid_at: new Date() }] : [];
    }
    throw new Error(`SQL nao roteado no fake: ${normalized}`);
  });

  const service = new PaymentsService(
    { query } as unknown as TenantConnectionProvider,
    {} as never,
    {} as never,
  );
  return { service, state };
}

describe('PaymentsService — ownership intra-mesa', () => {
  const previousClientConfirm = process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;

  beforeEach(() => {
    delete process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
  });

  afterAll(() => {
    if (previousClientConfirm === undefined) delete process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM;
    else process.env.PAYMENTS_ALLOW_CLIENT_CONFIRM = previousClientConfirm;
  });

  it.each(['individual', 'split'] as const)(
    'cliente A nao confirma nem cancela pagamento %s do cliente B na mesma mesa',
    async (scope) => {
      for (const action of ['confirm', 'cancel'] as const) {
        const { service, state } = makeService(scope);
        const operation =
          action === 'confirm'
            ? service.confirmPayment(PAYMENT, SESSION, undefined, CUSTOMER_A)
            : service.cancelPayment(PAYMENT, SESSION, CUSTOMER_A);

        await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
        expect(state.status).toBe('pending');
        expect(state.mutations).toBe(0);
      }
    },
  );

  it.each(['individual', 'split'] as const)(
    'cliente B, dono da visita, pode confirmar e cancelar seu pagamento %s',
    async (scope) => {
      const confirm = makeService(scope);
      await expect(
        confirm.service.confirmPayment(PAYMENT, SESSION, undefined, CUSTOMER_B),
      ).resolves.toEqual({ paymentId: PAYMENT, status: 'awaiting_settlement' });
      expect(confirm.state.mutations).toBe(1);

      const cancel = makeService(scope);
      await expect(cancel.service.cancelPayment(PAYMENT, SESSION, CUSTOMER_B)).resolves.toEqual({
        paymentId: PAYMENT,
        status: 'cancelled',
      });
      expect(cancel.state.mutations).toBe(1);
    },
  );

  it('modo table continua colaborativo para participantes diferentes da mesma mesa', async () => {
    const confirm = makeService('table');
    await expect(
      confirm.service.confirmPayment(PAYMENT, SESSION, undefined, CUSTOMER_A),
    ).resolves.toEqual({ paymentId: PAYMENT, status: 'awaiting_settlement' });

    const cancel = makeService('table');
    await expect(cancel.service.cancelPayment(PAYMENT, SESSION, CUSTOMER_B)).resolves.toEqual({
      paymentId: PAYMENT,
      status: 'cancelled',
    });
  });

  it('caller interno sem identidade explicita preserva compatibilidade', async () => {
    const { service } = makeService('split');
    await expect(service.confirmPayment(PAYMENT, SESSION)).resolves.toEqual({
      paymentId: PAYMENT,
      status: 'awaiting_settlement',
    });
  });
});
