'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterTablePicker } from '../../../../screens/waiter/ScreenWaiterTablePicker';

export default function WaiterTablePickerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';

  return (
    <ScreenWaiterTablePicker
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onPick={(t) => router.push(`/waiter/scan-qr/delivery-confirm?tenant=${tenantSlug}&table=${encodeURIComponent(t.table_code)}`)}
    />
  );
}
