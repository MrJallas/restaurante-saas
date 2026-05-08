'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerComplaintWaiting } from '../../../../screens/feedback-and-history/ScreenCustomerComplaintWaiting';

/**
 * Route: `/{slug}/complaints/{id}`
 *
 * Waiting / response screen for a specific complaint. Lists messages and
 * subscribes to `complaint.responded` / `complaint.resolved` WS events for
 * live updates.
 */
export default function ComplaintWaitingPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  const id = String(params.id ?? '');
  if (!slug || !id) return null;
  return <ScreenCustomerComplaintWaiting slug={slug} complaintId={id} />;
}
