import { canOpenConfirmedPaymentFeedback } from './feedbackPaymentAccess';

describe('canOpenConfirmedPaymentFeedback', () => {
  const visitId = '11111111-1111-4111-8111-111111111111';
  const otherVisitId = '22222222-2222-4222-8222-222222222222';

  it('accepts only the confirmed payment that belongs to the current visit', () => {
    expect(
      canOpenConfirmedPaymentFeedback({
        paymentId: 'payment-own',
        visitId,
        payments: [{ id: 'payment-own', visitId, status: 'confirmed' }],
      }),
    ).toBe(true);
    expect(
      canOpenConfirmedPaymentFeedback({
        paymentId: 'payment-other',
        visitId,
        payments: [{ id: 'payment-other', visitId: otherVisitId, status: 'confirmed' }],
      }),
    ).toBe(false);
  });

  it('accepts a confirmed shared table payment only when its paymentId is explicit', () => {
    const payments = [{ id: 'payment-table', visitId: null, status: 'paid' }];
    expect(canOpenConfirmedPaymentFeedback({ paymentId: 'payment-table', visitId, payments })).toBe(
      true,
    );
    expect(canOpenConfirmedPaymentFeedback({ paymentId: null, visitId, payments })).toBe(false);
  });

  it('rejects pending, awaiting-settlement and cancelled demonstrations', () => {
    for (const status of ['pending', 'awaiting_settlement', 'cancelled']) {
      expect(
        canOpenConfirmedPaymentFeedback({
          paymentId: `payment-${status}`,
          visitId,
          payments: [{ id: `payment-${status}`, visitId, status }],
        }),
      ).toBe(false);
    }
  });
});
