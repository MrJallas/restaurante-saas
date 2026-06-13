'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterScanQr } from '../../../screens/waiter/ScreenWaiterScanQr';

function WaiterScanQrPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';

  return (
    <ScreenWaiterScanQr
      onClose={() => router.back()}
      onManualEntry={() => router.push(`/waiter/scan-qr/picker?tenant=${tenantSlug}`)}
      onScanned={(code) =>
        router.push(
          `/waiter/scan-qr/delivery-confirm?tenant=${tenantSlug}&table=${encodeURIComponent(code)}`,
        )
      }
    />
  );
}

export default function WaiterScanQrPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterScanQrPageInner />
    </React.Suspense>
  );
}
