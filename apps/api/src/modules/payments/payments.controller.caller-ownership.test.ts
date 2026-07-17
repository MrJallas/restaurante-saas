import type { Request } from 'express';
import { PaymentsController } from './payments.controller';
import type { SessionData } from '../../common/guards/session.guard';

const SESSION = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAYMENT = '33333333-3333-4333-8333-333333333333';

describe('PaymentsController — identidade do caller', () => {
  it('deriva recognition server-side em confirm e cancel, sem aceitar identidade do body', async () => {
    const payments = {
      confirmPayment: jest.fn(async () => ({ ok: true })),
      cancelPayment: jest.fn(async () => ({ ok: true })),
    };
    const resolver = { tryGetCustomerId: jest.fn(async () => CUSTOMER) };
    const controller = new PaymentsController(payments as never, resolver as never);
    const req = { headers: {}, cookies: {} } as unknown as Request;
    const session = { sessionId: SESSION } as SessionData;

    await controller.confirmPayment(PAYMENT, { pspTransactionId: 'psp-1' }, session, req);
    await controller.cancelPayment(PAYMENT, session, req);

    expect(resolver.tryGetCustomerId).toHaveBeenNthCalledWith(1, req);
    expect(resolver.tryGetCustomerId).toHaveBeenNthCalledWith(2, req);
    expect(payments.confirmPayment).toHaveBeenCalledWith(PAYMENT, SESSION, 'psp-1', CUSTOMER);
    expect(payments.cancelPayment).toHaveBeenCalledWith(PAYMENT, SESSION, CUSTOMER);
  });
});
