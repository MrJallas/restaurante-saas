import { Injectable, Logger } from '@nestjs/common';

/**
 * Stub PushService — exists so the cron jobs (and B1's services later) can
 * inject a stable interface today. The real implementation will plug in
 * APNs/FCM via `services/notifications` in a later phase. Until then, every
 * call is logged and counted so the recurring jobs can mark `push_sent_at`
 * idempotently.
 *
 * TODO(B2 Gate 2): swap with real provider once the notifications service
 * lands. Keep the method shape stable so callers don't have to change.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async sendOrderRatingPush(params: {
    tenantSlug: string;
    customerId: string | null;
    orderId: string;
  }): Promise<{ delivered: boolean }> {
    this.logger.log(
      `[stub] order-rating push tenant=${params.tenantSlug} order=${params.orderId} customer=${params.customerId ?? 'null'}`,
    );
    return { delivered: true };
  }
}
