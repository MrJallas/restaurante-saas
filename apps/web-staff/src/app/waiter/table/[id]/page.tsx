'use client';

// /waiter/table/[id] — Onda 3 (round 18). ScreenTableDetail.

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenTableDetail } from '../../../../screens/waiter/ScreenTableDetail';

function TableDetailInner() {
  const route = useParams<{ id: string }>();
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const tenantSlug =
    params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const numRaw = params.get('tableNumber');
  const tableNumber = numRaw ? parseInt(numRaw, 10) : undefined;
  return (
    <ScreenTableDetail
      dark={dark}
      tenantSlug={tenantSlug}
      tableId={route?.id ?? ''}
      tableNumber={Number.isFinite(tableNumber as number) ? tableNumber : undefined}
    />
  );
}

export default function WaiterTablePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <TableDetailInner />
    </Suspense>
  );
}
