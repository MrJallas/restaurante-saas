'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostReservations } from '../../../screens/host/ScreenHostReservations';

function HostReservationsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostReservations
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}

export default function HostReservationsPage() {
  return (
    <React.Suspense fallback={null}>
      <HostReservationsPageInner />
    </React.Suspense>
  );
}
