'use client';

import * as React from 'react';
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostTableStatusList } from '../../../../screens/host/ScreenHostTableStatusList';

const VALID_STATUS = new Set(['alerta', 'liberada', 'ocupada', 'livre']);

function HostTableStatusPageInner() {
  const router = useRouter();
  const routeParams = useParams<{ status: string }>();
  const params = useSearchParams();
  const status = routeParams.status;
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  if (!VALID_STATUS.has(status)) notFound();

  return (
    <ScreenHostTableStatusList
      tenantSlug={tenantSlug}
      status={status as 'alerta' | 'liberada' | 'ocupada' | 'livre'}
      onBack={() => router.back()}
      onLiberate={(table) =>
        router.push(`/host/liberate/${table}?tenant=${tenantSlug}&hostId=${hostId}`)
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

export default function HostTableStatusPage() {
  return (
    <React.Suspense fallback={null}>
      <HostTableStatusPageInner />
    </React.Suspense>
  );
}
