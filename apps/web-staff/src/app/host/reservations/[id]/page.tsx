'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostReservationDetail } from '../../../../screens/host/ScreenHostReservationDetail';

function HostReservationDetailPageInner() {
  const router = useRouter();
  const routeParams = useParams<{ id: string }>();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';
  const reservationId = routeParams.id;

  return (
    <ScreenHostReservationDetail
      tenantSlug={tenantSlug}
      reservationId={reservationId}
      onBack={() => router.back()}
      onLiberate={(tableNumber) =>
        router.push(
          `/host/liberate/${tableNumber}?tenant=${tenantSlug}&hostId=${hostId}&reservationId=${reservationId}`,
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

export default function HostReservationDetailPage() {
  return (
    <React.Suspense fallback={null}>
      <HostReservationDetailPageInner />
    </React.Suspense>
  );
}
