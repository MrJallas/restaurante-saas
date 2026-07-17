'use client';

// Host messages route — wraps ScreenStaffMessages with role="host".
// P1 #25 — host profile previously deep-linked into /waiter/mensagens,
// which mounted the waiter bottom-nav and waiter event channels.
// Hosts now have their own route mirroring the waiter pattern; the
// underlying screen is shared and switches subscriptions via `role`.

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/waiter/ScreenStaffMessages';
import { defaultTenantSlug, readStaffSession, type StaffSession } from '../../../lib/api';

function HostMessagesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = React.useState<StaffSession | null | undefined>(undefined);
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const hostIdParam = params.get('hostId');
  const userId = hostIdParam ?? session?.staffId ?? '';

  React.useEffect(() => {
    setSession(readStaffSession());
  }, []);

  if (!hostIdParam && session === undefined) return null;

  return (
    <ScreenStaffMessages
      tenantSlug={tenantSlug}
      role="host"
      userId={userId}
      onBack={() => router.back()}
      onOpenThread={(threadId) =>
        router.push(`/host/mensagens/${threadId}?tenant=${tenantSlug}&hostId=${userId}`)
      }
    />
  );
}

export default function HostMessagesPage() {
  return (
    <React.Suspense fallback={null}>
      <HostMessagesPageInner />
    </React.Suspense>
  );
}
