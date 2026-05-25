'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostHome } from '../../screens/host/ScreenHostHome';

function HostHomePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostHome
      tenantSlug={tenantSlug}
      hostId={hostId}
      onLiberate={(t) => router.push(`/host/liberate/${t}?tenant=${tenantSlug}`)}
      onOpenLateArrival={(id) => router.push(`/host/late-arrival/${id}?tenant=${tenantSlug}&hostId=${hostId}`)}
      onOpenScanVerification={(id) => router.push(`/host/scan-verification/${id}?tenant=${tenantSlug}&hostId=${hostId}`)}
      onTabChange={(tab) => {
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'inbox') router.push(`/host?tenant=${tenantSlug}#inbox`);
      }}
    />
  );
}

export default function HostHomePage() {
  return (
    <React.Suspense fallback={null}>
      <HostHomePageInner />
    </React.Suspense>
  );
}
