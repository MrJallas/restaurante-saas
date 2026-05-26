'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterTablePicker } from '../../../../screens/waiter/ScreenWaiterTablePicker';

function WaiterTablePickerPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const direct = params.get('direct') === '1';

  return (
    <ScreenWaiterTablePicker
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onPick={(t) => {
        const tableNumber = parseInt(t.label.replace(/[^0-9]/g, ''), 10);
        const qs = new URLSearchParams({
          tenant: tenantSlug,
          table: t.table_code || t.id,
        });
        if (Number.isFinite(tableNumber) && tableNumber > 0) {
          qs.set('tableNumber', String(tableNumber));
        }
        router.push(
          direct
            ? `/waiter/order-direct?${qs.toString()}`
            : `/waiter/scan-qr/delivery-confirm?${qs.toString()}`,
        );
      }}
    />
  );
}

export default function WaiterTablePickerPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterTablePickerPageInner />
    </React.Suspense>
  );
}
