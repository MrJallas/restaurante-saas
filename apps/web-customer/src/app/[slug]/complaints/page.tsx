'use client';

import { useParams } from 'next/navigation';
import { ScreenCustomerComplaints } from '../../../screens/feedback-and-history/ScreenCustomerComplaints';

export default function ComplaintsPage() {
  const params = useParams();
  const slug = String(params.slug ?? '');
  if (!slug) return null;
  return <ScreenCustomerComplaints slug={slug} />;
}
