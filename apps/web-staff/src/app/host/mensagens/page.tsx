'use client';

// Host messages route — wraps ScreenStaffMessages with role="host".
// P1 #25 — host profile previously deep-linked into /waiter/mensagens,
// which mounted the waiter bottom-nav and waiter event channels.
// Hosts now have their own route mirroring the waiter pattern; the
// underlying screen is shared and switches subscriptions via `role`.

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/waiter/ScreenStaffMessages';

function HostMessagesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const userId = params.get('hostId') ?? '';

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
