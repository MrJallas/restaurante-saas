'use client';

// /manager/alertas — Onda 2 (round 18). ScreenManagerAlertsAll.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerAlertsAll } from '../../../screens/manager/ScreenManagerAlertsAll';

function AlertsAllInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerAlertsAll dark={dark} tenantSlug={slug} />;
}

export default function ManagerAlertsAllPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <AlertsAllInner />
    </Suspense>
  );
}
