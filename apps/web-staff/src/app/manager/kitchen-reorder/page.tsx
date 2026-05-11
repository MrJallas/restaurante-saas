'use client';

// /manager/kitchen-reorder — Onda 2 (round 18). ScreenManagerKitchenReorder.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerKitchenReorder } from '../../../screens/manager/ScreenManagerKitchenReorder';

function KitchenReorderInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  return <ScreenManagerKitchenReorder dark={dark} />;
}

export default function ManagerKitchenReorderPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <KitchenReorderInner />
    </Suspense>
  );
}
