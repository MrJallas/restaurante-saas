import type { Request } from 'express';
import { OrdersController } from './orders.controller';
import type { SessionData } from '../../common/guards/session.guard';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER = '33333333-3333-4333-8333-333333333333';

describe('OrdersController — identidade do caller', () => {
  it('deriva recognition server-side em confirm e cancel', async () => {
    const orders = {
      confirmOrder: jest.fn(async () => ({ ok: true })),
      cancelOrder: jest.fn(async () => ({ ok: true })),
    };
    const resolver = { tryGetCustomerId: jest.fn(async () => CUSTOMER) };
    const controller = new OrdersController(orders as never, resolver as never);
    const req = { headers: {}, cookies: {} } as unknown as Request;
    const session = { sessionId: SESSION } as SessionData;

    await controller.confirmOrder(ORDER, 'demo', session, req);
    await controller.cancelOrder(ORDER, 'demo', session, req);

    expect(resolver.tryGetCustomerId).toHaveBeenNthCalledWith(1, req);
    expect(resolver.tryGetCustomerId).toHaveBeenNthCalledWith(2, req);
    expect(orders.confirmOrder).toHaveBeenCalledWith(ORDER, SESSION, 'demo', CUSTOMER);
    expect(orders.cancelOrder).toHaveBeenCalledWith(ORDER, SESSION, 'demo', CUSTOMER);
  });
});
