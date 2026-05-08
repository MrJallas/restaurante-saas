'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostLateArrival } from '../../../../screens/host/ScreenHostLateArrival';

export default function HostLateArrivalPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ id: string }>();
  const tenantSlug = search.get('tenant') ?? '';
  const id = params?.id ?? '';

  return (
    <ScreenHostLateArrival
      tenantSlug={tenantSlug}
      requestId={id}
      onBack={() => router.back()}
      onResolved={() => router.push(`/host?tenant=${tenantSlug}`)}
    />
  );
}
