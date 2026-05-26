'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenWaiterQuickOrder } from '../../../screens/waiter/ScreenWaiterQuickOrder';
import { defaultTenantSlug } from '../../../lib/api';

function DirectOrderInner() {
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const tableRef = params.get('table') ?? '';
  const tableNumberRaw = params.get('tableNumber');
  const tableNumber = tableNumberRaw ? Number(tableNumberRaw) : undefined;

  return (
    <ScreenWaiterQuickOrder
      tenantSlug={tenantSlug}
      tableRef={tableRef}
      tableNumber={Number.isFinite(tableNumber as number) ? tableNumber : undefined}
    />
  );
}

export default function WaiterDirectOrderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando...</div>}>
      <DirectOrderInner />
    </Suspense>
  );
}
