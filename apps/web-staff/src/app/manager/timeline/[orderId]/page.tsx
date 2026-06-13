'use client';

// /manager/timeline/[orderId] — Onda 2. ScreenManagerTableTimeline.

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenManagerTableTimeline } from '../../../../screens/manager/ScreenManagerTableTimeline';

function TimelineInner() {
  const route = useParams<{ orderId: string }>();
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const tableNumberRaw = params.get('tableNumber');
  const tableNumber = tableNumberRaw ? parseInt(tableNumberRaw, 10) : undefined;
  return (
    <ScreenManagerTableTimeline
      dark={dark}
      orderId={route?.orderId ?? ''}
      tableNumber={Number.isFinite(tableNumber as number) ? tableNumber : undefined}
    />
  );
}

export default function ManagerTimelinePage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <TimelineInner />
    </Suspense>
  );
}
