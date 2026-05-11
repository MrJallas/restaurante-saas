'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHomeGrid } from '../../screens/waiter/ScreenHomeGrid';

function WaiterHomePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const waiterId = params.get('waiterId') ?? '';

  return (
    <ScreenHomeGrid
      tenantSlug={tenantSlug}
      waiterId={waiterId}
      onNewEntry={() => router.push(`/waiter/new-entry?tenant=${tenantSlug}`)}
      onOpenCall={(callId) =>
        router.push(`/waiter/call/${callId}?tenant=${tenantSlug}`)
      }
      onOpenTable={(t) =>
        router.push(`/waiter/table/${t}?tenant=${tenantSlug}&tableNumber=${t}`)
      }
      onTabChange={(tab) => {
        if (tab === 'me') router.push(`/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}`);
        else if (tab === 'calls') router.push(`/waiter/chamados?tenant=${tenantSlug}`);
        else if (tab === 'scan') router.push(`/waiter/scan-qr?tenant=${tenantSlug}`);
      }}
      fab
    />
  );
}

export default function WaiterHomePage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterHomePageInner />
    </React.Suspense>
  );
}
