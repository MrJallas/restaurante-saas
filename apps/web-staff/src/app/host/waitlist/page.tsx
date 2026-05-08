'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostWaitlist } from '../../../screens/host/ScreenHostWaitlist';

export default function HostWaitlistPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostWaitlist
      tenantSlug={tenantSlug}
      onBack={() => router.back()}
      onTabChange={(tab) => {
        if (tab === 'tables') router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
      }}
    />
  );
}
