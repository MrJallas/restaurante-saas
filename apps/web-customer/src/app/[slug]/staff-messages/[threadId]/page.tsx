'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerStaffThread } from '../../../../screens/feedback-and-history/ScreenCustomerStaffThread';

/**
 * Route: `/{slug}/staff-messages/{threadId}`
 *
 * Detail view of a single staff thread. Unlike `/chat-history/{threadId}`
 * (read-only), this surface ALSO has a composer so the customer can reply
 * back to the team — the BE persists in Mongo + emits WS for a future
 * staff inbox to react.
 */
export default function StaffThreadPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  const threadId = String(params.threadId ?? '');
  if (!slug || !threadId) return null;
  return <ScreenCustomerStaffThread slug={slug} threadId={threadId} />;
}
