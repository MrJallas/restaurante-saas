'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenStaffMessageThread } from '../../../../screens/manager';

function ThreadInner() {
  const route = useParams<{ threadId: string }>();
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenStaffMessageThread tenantSlug={slug} threadId={route.threadId} />;
}

export default function ManagerMessageThreadPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <ThreadInner />
    </Suspense>
  );
}
