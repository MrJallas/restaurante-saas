'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostTableSwap } from '../../../screens/host/ScreenHostTableSwap';

function HostSwapPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const fromTable = params.get('from') ? parseInt(params.get('from') ?? '0', 10) : undefined;

  return (
    <ScreenHostTableSwap
      tenantSlug={tenantSlug}
      fromTable={fromTable}
      onBack={() => router.back()}
      onDone={() => router.push(`/host?tenant=${tenantSlug}`)}
    />
  );
}

export default function HostSwapPage() {
  return (
    <React.Suspense fallback={null}>
      <HostSwapPageInner />
    </React.Suspense>
  );
}
