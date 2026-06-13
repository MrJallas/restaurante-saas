'use client';

// /manager/cortesias — Onda 1B (round 18). Mounta ScreenManagerCourtesies.
// Tab default = history. ?tab=new abre o compositor stub.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ScreenManagerCourtesies,
  type CourtesiesTab,
} from '../../../screens/manager/ScreenManagerCourtesies';

function CourtesiesInner() {
  const params = useSearchParams();
  const tab = (params.get('tab') as CourtesiesTab | null) ?? 'history';
  const dark = params.get('dark') === '1';
  return <ScreenManagerCourtesies tab={tab} dark={dark} />;
}

export default function ManagerCourtesiesPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <CourtesiesInner />
    </Suspense>
  );
}
