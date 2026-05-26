'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostWaitlist } from '../../../screens/host/ScreenHostWaitlist';

function HostWaitlistPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostWaitlist
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onOpenEntry={(id) => router.push(`/host/waitlist/${id}?tenant=${tenantSlug}&hostId=${hostId}`)}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'inbox') router.push(`/host/notifications?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}

export default function HostWaitlistPage() {
  return (
    <React.Suspense fallback={null}>
      <HostWaitlistPageInner />
    </React.Suspense>
  );
}
