'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOrdersPause } from '../../../screens/manager';

function PauseInner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const preselectedWaiterId = params.get('waiterId') || undefined;
  const summaryForId = params.get('summaryId') || undefined;
  return (
    <ScreenManagerOrdersPause
      tenantSlug={slug}
      preselectedWaiterId={preselectedWaiterId}
      summaryForId={summaryForId}
    />
  );
}

export default function ManagerOrdersPausePage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <PauseInner />
    </Suspense>
  );
}
