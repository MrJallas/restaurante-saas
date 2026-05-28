'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerCourtesyHistory } from '../../../screens/feedback-and-history/ScreenCustomerCourtesyHistory';

export default function CourtesyHistoryPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  if (!slug) return null;
  return <ScreenCustomerCourtesyHistory slug={slug} />;
}
