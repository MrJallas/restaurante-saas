import { apiPost } from './api';

export type CustomerEventType =
  | 'menu_viewed'
  | 'assistant_opened'
  | 'session_resumed'
  | 'item_viewed';

export function recordCustomerEvent(
  slug: string,
  eventType: CustomerEventType,
  metadata: Record<string, unknown> = {},
): void {
  if (!slug || typeof window === 'undefined') return;
  void apiPost(`/${slug}/customer/events`, {
    event_type: eventType,
    metadata,
  }).catch(() => {
    /* best-effort telemetry only */
  });
}
