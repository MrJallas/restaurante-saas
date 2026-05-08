'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessageThread } from '../../../../screens/waiter/ScreenStaffMessageThread';

export default function WaiterThreadPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ threadId: string }>();
  const tenantSlug = search.get('tenant') ?? '';
  const userId = search.get('waiterId') ?? '';
  const threadId = params?.threadId ?? '';

  return (
    <ScreenStaffMessageThread
      tenantSlug={tenantSlug}
      threadId={threadId}
      role="waiter"
      myUserId={userId}
      onBack={() => router.back()}
    />
  );
}
