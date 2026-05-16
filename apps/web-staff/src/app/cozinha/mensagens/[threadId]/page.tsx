'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessageThread } from '../../../../screens/waiter/ScreenStaffMessageThread';

function KitchenMessageThreadInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ threadId: string }>();
  const tenantSlug =
    search.get('tenant') ||
    search.get('slug') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    'restaurant_dev';
  const userId = search.get('cookId') || search.get('staffId') || '';
  const threadId = decodeURIComponent(params?.threadId ?? '');

  return (
    <ScreenStaffMessageThread
      tenantSlug={tenantSlug}
      threadId={threadId}
      role="cook"
      myUserId={userId}
      onBack={() => router.push(`/cozinha/mensagens?tenant=${tenantSlug}&cookId=${userId}`)}
    />
  );
}

export default function KitchenMessageThreadPage() {
  return (
    <React.Suspense fallback={null}>
      <KitchenMessageThreadInner />
    </React.Suspense>
  );
}
