'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenStaffMessageThread } from '../../../../screens/waiter/ScreenStaffMessageThread';
import { defaultTenantSlug, readStaffSession, type StaffSession } from '../../../../lib/api';

function HostMessageThreadInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ threadId: string }>();
  const [session, setSession] = React.useState<StaffSession | null | undefined>(undefined);
  const tenantSlug = search.get('tenant') ?? defaultTenantSlug();
  const hostIdParam = search.get('hostId');
  const userId = hostIdParam ?? session?.staffId ?? '';
  const threadId = params?.threadId ?? '';

  React.useEffect(() => {
    setSession(readStaffSession());
  }, []);

  if (!hostIdParam && session === undefined) return null;

  return (
    <ScreenStaffMessageThread
      tenantSlug={tenantSlug}
      threadId={threadId}
      role="host"
      myUserId={userId}
      onBack={() => router.push(`/host/mensagens?tenant=${tenantSlug}&hostId=${userId}`)}
    />
  );
}

export default function HostMessageThreadPage() {
  return (
    <React.Suspense fallback={null}>
      <HostMessageThreadInner />
    </React.Suspense>
  );
}
