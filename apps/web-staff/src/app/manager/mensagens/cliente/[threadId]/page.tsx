'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenCustomerStaffMessageThread } from '../../../../../screens/manager';

function CustomerThreadInner() {
  const route = useParams<{ threadId: string }>();
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return (
    <ScreenCustomerStaffMessageThread
      tenantSlug={slug}
      threadId={decodeURIComponent(route.threadId)}
    />
  );
}

export default function ManagerCustomerMessageThreadPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando...</div>}>
      <CustomerThreadInner />
    </Suspense>
  );
}
