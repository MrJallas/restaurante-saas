'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOps, type OpsTab } from '../../../screens/manager';

function OpsInner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const tab = (params.get('tab') as OpsTab | null) ?? 'alerts';
  return <ScreenManagerOps tenantSlug={slug} tab={tab} />;
}

export default function ManagerOpsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <OpsInner />
    </Suspense>
  );
}
