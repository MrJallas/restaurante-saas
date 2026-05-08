'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterReportQrIssue } from '../../../screens/waiter/ScreenWaiterReportQrIssue';

export default function WaiterReportQrIssuePage() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const initialTable = parseInt(params.get('table') ?? '1', 10) || 1;

  return (
    <ScreenWaiterReportQrIssue
      tenantSlug={tenantSlug}
      initialTable={initialTable}
      onClose={() => router.back()}
      onSent={() => router.push(`/waiter?tenant=${tenantSlug}`)}
    />
  );
}
