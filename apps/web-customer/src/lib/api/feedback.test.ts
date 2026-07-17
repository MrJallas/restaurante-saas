import { apiPost } from '../api';
import { CUSTOMER_ERASURE_FULFILLED_EVENT } from '../customer-erasure';
import { buildComplaintCreateBody, createLgpdRequest } from './feedback';

jest.mock('../api', () => ({
  apiPost: jest.fn(),
  apiGet: jest.fn(),
}));

const apiPostMock = jest.mocked(apiPost);

describe('buildComplaintCreateBody', () => {
  it('sends problemType as structured data and preserves the customer text', () => {
    expect(
      buildComplaintCreateBody({
        text: 'A bebida veio quente.',
        problemType: 'item-errado',
        orderId: 'order-1',
      }),
    ).toEqual({
      orderId: 'order-1',
      orderRatingId: undefined,
      customerId: undefined,
      visitId: undefined,
      rating: undefined,
      text: 'A bebida veio quente.',
      attachedImageUrl: undefined,
      problemType: 'item-errado',
    });
  });

  it('does not fabricate a problem type before the user chooses one', () => {
    expect(buildComplaintCreateBody({ text: 'Quero explicar o que aconteceu.' }).problemType).toBe(
      undefined,
    );
  });
});

describe('createLgpdRequest', () => {
  beforeEach(() => apiPostMock.mockReset());

  it('notifica a limpeza global somente após exclusão confirmada pelo backend', async () => {
    const listener = jest.fn();
    window.addEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);
    apiPostMock.mockResolvedValue({
      protocolNumber: 'LGPD-2026-07-11-0001',
      status: 'fulfilled',
      executedAt: '2026-07-11T10:00:00.000Z',
      expiresAt: '2026-10-09T10:00:00.000Z',
    });

    await createLgpdRequest('restaurant_dev', { kind: 'erasure' });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);
  });

  it('não encerra a sessão para pedido diferente de exclusão', async () => {
    const listener = jest.fn();
    window.addEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);
    apiPostMock.mockResolvedValue({
      protocolNumber: 'LGPD-2026-07-11-0002',
      status: 'pending',
      executedAt: '',
      expiresAt: '2026-10-09T10:00:00.000Z',
    });

    await createLgpdRequest('restaurant_dev', { kind: 'access' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);
  });
});
