'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterTablePicker } from '../../../../screens/waiter/ScreenWaiterTablePicker';
import { waiterDirectOrderPath } from '../../../../lib/waiter-navigation';

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
        const tableRef = t.table_code || t.id;
        router.push(
          direct
            ? waiterDirectOrderPath(tenantSlug, tableRef, tableNumber)
            : `/waiter/scan-qr/delivery-confirm?${new URLSearchParams({
                tenant: tenantSlug,
                table: tableRef,
              }).toString()}`,
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
