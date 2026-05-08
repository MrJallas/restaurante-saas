'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterDeliveryConfirm } from '../../../../screens/waiter/ScreenWaiterDeliveryConfirm';

export default function WaiterDeliveryConfirmPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const tableCode = params.get('table') ?? '';

  // Items would normally come from the order endpoint; placeholder until route hits it.
  const items = [
    { q: 1, n: 'Risoto de camarão' },
    { q: 1, n: 'Filé ao vinho', note: 'sem cogumelos' },
  ];

  return (
    <ScreenWaiterDeliveryConfirm
      tableLabel={`Mesa ${tableCode || '—'}`}
      tableTimeAgo="agora"
      items={items}
      onCancel={() => router.back()}
      onBack={() => router.back()}
      onConfirm={() => router.push(`/waiter?tenant=${tenantSlug}`)}
    />
  );
}
