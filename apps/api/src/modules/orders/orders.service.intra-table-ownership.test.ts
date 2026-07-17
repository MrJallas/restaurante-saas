import { ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SESSION = '11111111-1111-4111-8111-111111111111';
const VISIT_B = '22222222-2222-4222-8222-222222222222';
const ORDER = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeService(billingMode: 'table' | 'individual') {
  const state = {
    status: 'pending_confirmation',
    mutations: 0,
    historyWrites: 0,
  };

  const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.includes('FROM orders o') && normalized.includes('WHERE o.id = $1')) {
      return [
        {
          id: ORDER,
          status: state.status,
          table_session_id: SESSION,
          billing_mode: billingMode,
          total_cents: 5_000,
          visit_id: billingMode === 'table' ? null : VISIT_B,
          owner_customer_id: billingMode === 'table' ? null : CUSTOMER_B,
        },
      ];
    }
    if (normalized.startsWith('UPDATE orders SET status')) {
      const next = normalized.includes("status = 'received'") ? 'received' : 'cancelled';
      if (state.status !== params[1]) return [];
      state.status = next;
      state.mutations += 1;
      return [{ id: ORDER }];
    }
    if (normalized.startsWith('INSERT INTO order_status_history')) {
      state.historyWrites += 1;
      return [{ id: '44444444-4444-4444-8444-444444444444' }];
    }
    if (normalized.startsWith('SELECT status FROM orders')) {
      return [{ status: state.status }];
    }
    throw new Error(`SQL nao roteado no fake: ${normalized}`);
  });

  const service = new OrdersService(
    { query } as unknown as TenantConnectionProvider,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, state };
}

describe('OrdersService — ownership intra-mesa', () => {
  it('cliente A nao confirma nem cancela pedido individual do cliente B na mesma mesa', async () => {
    for (const action of ['confirm', 'cancel'] as const) {
      const { service, state } = makeService('individual');
      const operation =
        action === 'confirm'
          ? service.confirmOrder(ORDER, SESSION, undefined, CUSTOMER_A)
          : service.cancelOrder(ORDER, SESSION, undefined, CUSTOMER_A);

      await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      expect(state.status).toBe('pending_confirmation');
      expect(state.mutations).toBe(0);
      expect(state.historyWrites).toBe(0);
    }
  });

  it('cliente B, dono da visita, pode confirmar e cancelar o proprio pedido individual', async () => {
    const confirm = makeService('individual');
    await expect(
      confirm.service.confirmOrder(ORDER, SESSION, undefined, CUSTOMER_B),
    ).resolves.toEqual({ orderId: ORDER, status: 'received' });
    expect(confirm.state.mutations).toBe(1);

    const cancel = makeService('individual');
    await expect(
      cancel.service.cancelOrder(ORDER, SESSION, undefined, CUSTOMER_B),
    ).resolves.toEqual({ orderId: ORDER, status: 'cancelled' });
    expect(cancel.state.mutations).toBe(1);
  });

  it('modo table continua colaborativo para participantes diferentes da mesma mesa', async () => {
    const confirm = makeService('table');
    await expect(
      confirm.service.confirmOrder(ORDER, SESSION, undefined, CUSTOMER_A),
    ).resolves.toEqual({ orderId: ORDER, status: 'received' });

    const cancel = makeService('table');
    await expect(
      cancel.service.cancelOrder(ORDER, SESSION, undefined, CUSTOMER_B),
    ).resolves.toEqual({ orderId: ORDER, status: 'cancelled' });
  });

  it('sweep interno sem identidade explicita preserva compatibilidade', async () => {
    const { service } = makeService('individual');
    await expect(service.confirmOrder(ORDER, SESSION)).resolves.toEqual({
      orderId: ORDER,
      status: 'received',
    });
  });
});
