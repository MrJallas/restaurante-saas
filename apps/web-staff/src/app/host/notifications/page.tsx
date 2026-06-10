'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostNotifications } from '../../../screens/host/ScreenHostNotifications';
import { defaultTenantSlug } from '../../../lib/api';

function NotificationsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') || params.get('slug') || defaultTenantSlug();
  const hostId = params.get('hostId') ?? '';

  return (
    <ScreenHostNotifications
      tenantSlug={tenantSlug}
      onBack={() => router.push(`/host?tenant=${tenantSlug}&hostId=${hostId}`)}
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

export default function HostNotificationsPage() {
  return (
    <React.Suspense fallback={null}>
      <NotificationsInner />
    </React.Suspense>
  );
}
