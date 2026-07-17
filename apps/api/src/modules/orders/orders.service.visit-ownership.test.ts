import { ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SESSION = '11111111-1111-4111-8111-111111111111';
const VISIT_B = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_A = '33333333-3333-4333-8333-333333333333';

function service(query: jest.Mock) {
  return new OrdersService(
    { query } as unknown as TenantConnectionProvider,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { getBill: jest.fn() } as never,
    {} as never,
  );
}

describe('OrdersService visit ownership', () => {
  it('bloqueia criar pedido usando visitId de outro participante da mesa', async () => {
    const query = jest.fn(async () => []);
    const instance = service(query);
    await expect(
      instance.createOrder(
        SESSION,
        VISIT_B,
        'individual',
        [{ menuItemId: 'item', quantity: 1 }],
        undefined,
        'demo',
        CUSTOMER_A,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('AND customer_id = $3'), [
      VISIT_B,
      SESSION,
      CUSTOMER_A,
    ]);
  });

  it('bloqueia consulta da comanda individual de outro participante', async () => {
    const instance = service(jest.fn(async () => []));
    await expect(instance.getBill(SESSION, 'individual', VISIT_B, CUSTOMER_A)).rejects.toThrow(
      /não pertence/i,
    );
  });
});
