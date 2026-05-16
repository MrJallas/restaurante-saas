'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/waiter/ScreenStaffMessages';

function KitchenMessagesPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug =
    params.get('tenant') ||
    params.get('slug') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    'restaurant_dev';
  const userId = params.get('cookId') || params.get('staffId') || '';

  return (
    <ScreenStaffMessages
      tenantSlug={tenantSlug}
      role="cook"
      userId={userId}
      onBack={() => router.push('/cozinha')}
      onOpenThread={(threadId) =>
        router.push(
          `/cozinha/mensagens/${encodeURIComponent(threadId)}?tenant=${tenantSlug}&cookId=${userId}`,
        )
      }
    />
  );
}

export default function KitchenMessagesPage() {
  return (
    <React.Suspense fallback={null}>
      <KitchenMessagesPageInner />
    </React.Suspense>
  );
}
