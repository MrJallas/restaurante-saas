'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterNewEntry } from '../../../screens/waiter/ScreenWaiterNewEntry';

function WaiterNewEntryPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';

  return (
    <ScreenWaiterNewEntry
      onClose={() => router.back()}
      onScanQr={() => router.push(`/waiter/scan-qr?tenant=${tenantSlug}`)}
      onPedidoDireto={() => router.push(`/waiter/scan-qr/picker?tenant=${tenantSlug}&direct=1`)}
      onContactManager={() => router.push(`/waiter/qr-issue?tenant=${tenantSlug}`)}
    />
  );
}

export default function WaiterNewEntryPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterNewEntryPageInner />
    </React.Suspense>
  );
}
