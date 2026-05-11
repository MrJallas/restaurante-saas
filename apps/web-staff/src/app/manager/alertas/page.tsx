'use client';

// /manager/alertas — Onda 2 (round 18). ScreenManagerAlertsAll.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerAlertsAll } from '../../../screens/manager/ScreenManagerAlertsAll';

function AlertsAllInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  return <ScreenManagerAlertsAll dark={dark} />;
}

export default function ManagerAlertsAllPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <AlertsAllInner />
    </Suspense>
  );
}
