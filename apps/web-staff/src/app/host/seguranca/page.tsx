'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostSecurity } from '../../../screens/host/ScreenHostSecurity';
import { performStaffLogout } from '../../../lib/api';

function HostSecurityPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostSecurity
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onLogout={async () => {
        // Revoga a sessão no Redis + limpa o cookie httpOnly (via proxy) antes
        // de limpar o localStorage — mesmo logout real que o host/profile usa.
        await performStaffLogout(tenantSlug);
        router.push('/');
      }}
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

export default function HostSecurityPage() {
  return (
    <React.Suspense fallback={null}>
      <HostSecurityPageInner />
    </React.Suspense>
  );
}
