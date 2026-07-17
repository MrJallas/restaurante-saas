import { PushService } from './push.service';

describe('PushService honest delivery contract', () => {
  it('does not claim delivery while no APNs/FCM provider is configured', async () => {
    const service = new PushService();
    await expect(
      service.sendOrderRatingPush({
        tenantSlug: 'luna',
        customerId: 'customer-1',
        orderId: 'order-1',
      }),
    ).resolves.toEqual({ delivered: false, reason: 'provider_not_configured' });
  });
});
