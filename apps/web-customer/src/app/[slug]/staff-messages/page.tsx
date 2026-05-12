'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerStaffMessages } from '../../../screens/feedback-and-history/ScreenCustomerStaffMessages';

/**
 * Route: `/{slug}/staff-messages`
 *
 * Inbox surface for staff-customer threads (manager/garçom/host/cozinha).
 * Sibling of `/chat-history` — same V20 visual language but a separate
 * collection in Mongo so the two are listed independently in the customer
 * app drawer + profile screen.
 */
export default function StaffMessagesPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  if (!slug) return null;
  return <ScreenCustomerStaffMessages slug={slug} />;
}
