'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHomeGrid } from '../../screens/waiter/ScreenHomeGrid';
import { defaultTenantSlug, readStaffSession, type StaffSession } from '../../lib/api';

function WaiterHomePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = React.useState<StaffSession | null | undefined>(undefined);
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const waiterIdParam = params.get('waiterId');
  const waiterId = waiterIdParam ?? session?.staffId ?? '';

  React.useEffect(() => {
    setSession(readStaffSession());
  }, []);

  if (!waiterIdParam && session === undefined) return null;

  return (
    <ScreenHomeGrid
      tenantSlug={tenantSlug}
      waiterId={waiterId}
      onNewEntry={() => router.push(`/waiter/new-entry?tenant=${tenantSlug}`)}
      onOpenCall={(callId) => router.push(`/waiter/call/${callId}?tenant=${tenantSlug}`)}
      onOpenTable={(t) => router.push(`/waiter/table/${t}?tenant=${tenantSlug}&tableNumber=${t}`)}
      onTabChange={(tab) => {
        if (tab === 'me') router.push(`/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}`);
        else if (tab === 'calls') router.push(`/waiter/chamados?tenant=${tenantSlug}`);
        else if (tab === 'shift') router.push(`/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}&focus=shift`);
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
