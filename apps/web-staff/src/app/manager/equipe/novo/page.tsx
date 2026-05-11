'use client';

// /manager/equipe/novo — Onda 1D (round 18). ScreenManagerStaffForm mode=create.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerStaffForm } from '../../../../screens/manager/ScreenManagerStaffForm';

function StaffFormInner() {
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  return <ScreenManagerStaffForm dark={dark} mode="create" />;
}

export default function ManagerStaffNovoPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>
      }
    >
      <StaffFormInner />
    </Suspense>
  );
}
