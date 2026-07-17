export const CUSTOMER_ERASURE_FULFILLED_EVENT = 'restaurant:customer-erasure-fulfilled';

export interface CustomerErasureFulfilledDetail {
  slug: string;
}

/** Notifica providers globais somente depois da confirmação autoritativa. */
export function announceCustomerErasureFulfilled(slug: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<CustomerErasureFulfilledDetail>(CUSTOMER_ERASURE_FULFILLED_EVENT, {
      detail: { slug },
    }),
  );
}
