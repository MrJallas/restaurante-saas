'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostSecurity } from '../../../screens/host/ScreenHostSecurity';

function HostSecurityPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostSecurity
      onBack={() => router.back()}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'inbox') router.push(`/host/notifications?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}

export default function HostSecurityPage() {
  return (
    <React.Suspense fallback={null}>
      <HostSecurityPageInner />
    </React.Suspense>
  );
}
