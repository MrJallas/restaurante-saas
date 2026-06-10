'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostAppearance } from '../../../screens/host/ScreenHostAppearance';

function HostAppearancePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostAppearance
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

export default function HostAppearancePage() {
  return (
    <React.Suspense fallback={null}>
      <HostAppearancePageInner />
    </React.Suspense>
  );
}
