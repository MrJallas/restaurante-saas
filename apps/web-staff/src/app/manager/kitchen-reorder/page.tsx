'use client';

// /manager/kitchen-reorder — Onda 2 (round 18). ScreenManagerKitchenReorder.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerKitchenReorder } from '../../../screens/manager/ScreenManagerKitchenReorder';

function KitchenReorderInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerKitchenReorder dark={dark} tenantSlug={slug} />;
}

export default function ManagerKitchenReorderPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <KitchenReorderInner />
    </Suspense>
  );
}
