'use client';

// /manager/compensate — Onda 1 wiring (round 18). Destino do "Abrir
// compositor" em ScreenManagerCourtesies. POSTa real pra
// /api/:slug/courtesies.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerCompensateClient } from '../../../screens/manager/ScreenManagerCompensateClient';

function CompensateInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const tableNumberRaw = params.get('tableNumber');
  const tableNumber = tableNumberRaw ? parseInt(tableNumberRaw, 10) : undefined;
  const tableSessionId = params.get('tableSessionId') ?? undefined;
  return (
    <ScreenManagerCompensateClient
      dark={dark}
      preselectedTableNumber={Number.isFinite(tableNumber as number) ? tableNumber : undefined}
      preselectedTableSessionId={tableSessionId}
    />
  );
}

export default function ManagerCompensatePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <CompensateInner />
    </Suspense>
  );
}
