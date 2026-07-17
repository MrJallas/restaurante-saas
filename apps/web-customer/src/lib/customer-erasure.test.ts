import {
  announceCustomerErasureFulfilled,
  CUSTOMER_ERASURE_FULFILLED_EVENT,
  type CustomerErasureFulfilledDetail,
} from './customer-erasure';

describe('announceCustomerErasureFulfilled', () => {
  it('publishes the tenant only after the caller confirms fulfillment', () => {
    const listener = jest.fn((event: Event) => (event as CustomEvent).detail);
    window.addEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);

    announceCustomerErasureFulfilled('restaurant_dev');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      (listener.mock.calls[0][0] as CustomEvent<CustomerErasureFulfilledDetail>).detail,
    ).toEqual({ slug: 'restaurant_dev' });
    window.removeEventListener(CUSTOMER_ERASURE_FULFILLED_EVENT, listener);
  });
});
