'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerChatHistory } from '../../../screens/feedback-and-history/ScreenCustomerChatHistory';

/**
 * Route: `/{slug}/chat-history`
 *
 * Hamburger-menu entry point for browsing past chat threads.
 */
export default function ChatHistoryPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  if (!slug) return null;
  return <ScreenCustomerChatHistory slug={slug} />;
}
