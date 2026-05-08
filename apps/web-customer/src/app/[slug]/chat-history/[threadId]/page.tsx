'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerChatThread } from '../../../../screens/feedback-and-history/ScreenCustomerChatThread';

/**
 * Route: `/{slug}/chat-history/{threadId}`
 *
 * Read-only view of a single past chat thread. Composer is intentionally
 * absent — the thread cannot be continued.
 */
export default function ChatHistoryThreadPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  const threadId = String(params.threadId ?? '');
  if (!slug || !threadId) return null;
  return <ScreenCustomerChatThread slug={slug} threadId={threadId} />;
}
