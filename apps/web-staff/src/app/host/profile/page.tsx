'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostProfile } from '../../../screens/host/ScreenHostProfile';

function HostProfilePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';
  const hostName = params.get('name') ?? 'Recepcionista';
  const hostInitials = params.get('initials') ?? hostName.slice(0, 2).toUpperCase();

  return (
    <ScreenHostProfile
      hostName={hostName}
      hostInitials={hostInitials}
      onBack={() => router.back()}
      onLogout={() => router.push('/')}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}`);
      }}
      onOpenMessages={() => router.push(`/host/mensagens?tenant=${tenantSlug}&hostId=${hostId}`)}
    />
  );
}

export default function HostProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <HostProfilePageInner />
    </React.Suspense>
  );
}
