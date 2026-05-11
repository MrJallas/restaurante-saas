'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostTurnosHistorico } from '../../../screens/host/ScreenHostTurnosHistorico';

function HostTurnosHistoricoPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostTurnosHistorico
      onBack={() => router.back()}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}

export default function HostTurnosHistoricoPage() {
  return (
    <React.Suspense fallback={null}>
      <HostTurnosHistoricoPageInner />
    </React.Suspense>
  );
}
