'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostTableLiberate } from '../../../../screens/host/ScreenHostTableLiberate';

export default function HostLiberatePage() {
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
