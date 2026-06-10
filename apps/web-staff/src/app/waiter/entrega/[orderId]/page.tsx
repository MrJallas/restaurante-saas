'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenWaiterDeliveryDetail } from '../../../../screens/waiter/ScreenWaiterDeliveryDetail';
import { defaultTenantSlug, readStaffSession } from '../../../../lib/api';
import { useStaffTheme } from '../../../../lib/theme';

function WaiterDeliveryDetailPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const { dark } = useStaffTheme();
  const orderId = String(params.orderId ?? '');
  const tenantSlug = search.get('tenant') ?? defaultTenantSlug();
  const [staffId, setStaffId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStaffId(search.get('waiterId') ?? readStaffSession()?.staffId ?? null);
  }, [search]);

  if (!orderId) return null;

  return (
    <ScreenWaiterDeliveryDetail
      dark={dark}
      tenantSlug={tenantSlug}
      orderId={orderId}
      staffId={staffId}
    />
  );
}

export default function WaiterDeliveryDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterDeliveryDetailPageInner />
    </React.Suspense>
  );
}
