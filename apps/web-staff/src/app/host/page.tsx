'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostHome } from '../../screens/host/ScreenHostHome';
import { defaultTenantSlug, readStaffSession, type StaffSession } from '../../lib/api';

function HostHomePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = React.useState<StaffSession | null | undefined>(undefined);
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const hostIdParam = params.get('hostId');
  const hostId = hostIdParam ?? session?.staffId ?? '';

  React.useEffect(() => {
    setSession(readStaffSession());
  }, []);

  if (!hostIdParam && session === undefined) return null;

  return (
    <ScreenHostHome
      tenantSlug={tenantSlug}
      hostId={hostId}
      onLiberate={(t) => router.push(`/host/liberate/${t}?tenant=${tenantSlug}`)}
      onOpenTableStatus={(status) =>
        router.push(`/host/tables/${status}?tenant=${tenantSlug}&hostId=${hostId}`)
      }
      onOpenScanVerification={(id) =>
        router.push(`/host/scan-verification/${id}?tenant=${tenantSlug}&hostId=${hostId}`)
      }
      onTabChange={(tab) => {
        if (tab === 'waitlist') router.push(`/host/waitlist?tenant=${tenantSlug}`);
        if (tab === 'reserva') router.push(`/host/reservations?tenant=${tenantSlug}`);
        if (tab === 'me') router.push(`/host/profile?tenant=${tenantSlug}&hostId=${hostId}`);
        if (tab === 'inbox')
          router.push(`/host/notifications?tenant=${tenantSlug}&hostId=${hostId}`);
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
