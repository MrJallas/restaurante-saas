'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostTableLiberate } from '../../../../screens/host/ScreenHostTableLiberate';

function HostLiberatePageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ tableId: string }>();
  const tenantSlug = search.get('tenant') ?? '';
  const tableNumber = parseInt(params?.tableId ?? '0', 10) || 0;

  return (
    <ScreenHostTableLiberate
      tenantSlug={tenantSlug}
      tableNumber={tableNumber}
      onBack={() => router.back()}
      onDone={() => router.push(`/host?tenant=${tenantSlug}`)}
    />
  );
}

export default function HostLiberatePage() {
  return (
    <React.Suspense fallback={null}>
      <HostLiberatePageInner />
    </React.Suspense>
  );
}
