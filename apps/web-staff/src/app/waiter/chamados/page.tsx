'use client';

// /waiter/chamados — Onda 3 (round 18). ScreenWaiterCalls.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenWaiterCalls } from '../../../screens/waiter/ScreenWaiterCalls';

function CallsInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const tenantSlug =
    params.get('tenant') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    'restaurant_dev';
  return <ScreenWaiterCalls dark={dark} tenantSlug={tenantSlug} />;
}

export default function WaiterCallsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <CallsInner />
    </Suspense>
  );
}
