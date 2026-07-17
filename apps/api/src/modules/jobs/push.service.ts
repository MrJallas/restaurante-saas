import { Injectable, Logger } from '@nestjs/common';

export interface PushDeliveryResult {
  delivered: boolean;
  reason?: 'provider_not_configured' | 'provider_rejected' | 'transport_error';
}

/**
 * Stable push boundary. No APNs/FCM provider exists in this repository yet,
 * so the adapter must report an honest non-delivery. Callers may retry, but
 * must never mark a notification as sent merely because this method returned.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async sendOrderRatingPush(params: {
    tenantSlug: string;
    customerId: string | null;
    orderId: string;
  }): Promise<PushDeliveryResult> {
    this.logger.warn(
      `Push não enviado (provider não configurado) tenant=${params.tenantSlug} order=${params.orderId} customer=${params.customerId ?? 'null'}`,
    );
    return { delivered: false, reason: 'provider_not_configured' };
  }
}
