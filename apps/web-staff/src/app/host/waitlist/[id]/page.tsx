'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostWaitlistDetail } from '../../../../screens/host/ScreenHostWaitlistDetail';

function HostWaitlistDetailPageInner() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';
  const entryId = routeParams.id;

  return (
    <ScreenHostWaitlistDetail
      tenantSlug={tenantSlug}
      entryId={entryId}
      onBack={() => router.back()}
      onResolved={() => router.push(`/host/waitlist?tenant=${tenantSlug}&hostId=${hostId}`)}
      onLiberate={(tableNumber) =>
        router.push(
          `/host/liberate/${tableNumber}?tenant=${tenantSlug}&hostId=${hostId}&waitlistId=${entryId}`,
        )
      }
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'reserva')
          router.push(`/host/reservations?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'inbox')
          router.push(`/host/notifications?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}

export default function HostWaitlistDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <HostWaitlistDetailPageInner />
    </React.Suspense>
  );
}
