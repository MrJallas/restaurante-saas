'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostScanVerification } from '../../../../screens/host/ScreenHostScanVerification';

function HostScanVerificationPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ id: string }>();
  const tenantSlug = search.get('tenant') ?? '';
  const id = params?.id ?? '';

  return (
    <ScreenHostScanVerification
      tenantSlug={tenantSlug}
      requestId={id}
      onBack={() => router.back()}
      onResolved={() => router.push(`/host?tenant=${tenantSlug}`)}
    />
  );
}

export default function HostScanVerificationPage() {
  return (
    <React.Suspense fallback={null}>
      <HostScanVerificationPageInner />
    </React.Suspense>
  );
}
