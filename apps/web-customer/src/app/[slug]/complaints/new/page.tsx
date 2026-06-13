'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ScreenCustomerComplaintCompose } from '../../../../screens/feedback-and-history/ScreenCustomerComplaintCompose';

/**
 * Route: `/{slug}/complaints/new?orderId=...&orderRatingId=...`
 *
 * Composer for a new complaint. Reached either from the rating screen
 * redirect (low rating + comment) or from a "Reportar um problema" CTA.
 */
export default function ComplaintComposePage() {
  const params = useParams();
  const sp = useSearchParams();
  const slug = String(params.slug ?? '');
  const orderId = sp.get('orderId') ?? undefined;
  const orderRatingId = sp.get('orderRatingId') ?? undefined;
  if (!slug) return null;
  return (
    <ScreenCustomerComplaintCompose slug={slug} orderId={orderId} orderRatingId={orderRatingId} />
  );
}
