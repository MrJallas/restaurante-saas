'use client';

// P1 #31 — Route mount for ScreenManagerTableMenu.
// VIP via TableMenu is in spec (docs/features/vip-customer.md), but the
// component had no host route until now — manager dashboards couldn't
// reach the screen except via direct mount in tests. The path mirrors
// the V5 deep-link convention `/manager/table-menu/<tableSessionId>`.

import { Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ScreenManagerTableMenu } from '../../../../screens/manager/ScreenManagerTableMenu';

function ManagerTableMenuInner() {
  const router = useRouter();
  const route = useParams<{ tableId: string }>();
  const search = useSearchParams();
  const tenantSlug = search.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const tenantId = search.get('tenantId') || process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';
  const tableSessionId = route?.tableId ?? '';
  const tableNumber = parseInt(search.get('tableNumber') ?? '0', 10) || 0;
  const customerId = search.get('customerId') ?? undefined;
  const customerName = search.get('customerName') ?? undefined;

  return (
    <ScreenManagerTableMenu
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      tableSessionId={tableSessionId}
      tableNumber={tableNumber}
      customerId={customerId}
      customerName={customerName}
      onClose={() => router.back()}
    />
  );
}

export default function ManagerTableMenuPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <ManagerTableMenuInner />
    </Suspense>
  );
}
