'use client';

// /waiter/call/[id] — Onda 3 (round 18). ScreenWaiterCallDetail.

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenWaiterCallDetail } from '../../../../screens/waiter/ScreenWaiterCallDetail';

const VALID_TYPES = ['pediu-conta', 'chamou-garcom', 'pronto-cozinha', 'mais-bebida'] as const;
type CallType = (typeof VALID_TYPES)[number];

function CallDetailInner() {
  const route = useParams<{ id: string }>();
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const t = params.get('type');
  const callType: CallType | undefined =
    t && (VALID_TYPES as readonly string[]).includes(t) ? (t as CallType) : undefined;
  const numRaw = params.get('tableNumber');
  const tableNumber = numRaw ? parseInt(numRaw, 10) : undefined;
  const tenantSlug =
    params.get('tenant') ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    'restaurant_dev';
  return (
    <ScreenWaiterCallDetail
      dark={dark}
      callId={route?.id ?? ''}
      tenantSlug={tenantSlug}
      callType={callType}
      tableNumber={Number.isFinite(tableNumber as number) ? tableNumber : undefined}
    />
  );
}

export default function WaiterCallPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <CallDetailInner />
    </Suspense>
  );
}
