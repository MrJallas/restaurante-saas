'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/waiter/ScreenStaffMessages';

function WaiterMessagesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const userId = params.get('waiterId') ?? '';

  return (
    <ScreenStaffMessages
      tenantSlug={tenantSlug}
      role="waiter"
      userId={userId}
      onBack={() => router.back()}
      onOpenThread={(threadId) =>
        router.push(`/waiter/mensagens/${threadId}?tenant=${tenantSlug}&waiterId=${userId}`)
      }
    />
  );
}

export default function WaiterMessagesPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterMessagesPageInner />
    </React.Suspense>
  );
}
