'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerProfile } from '../../../screens/manager/ScreenManagerProfile';

function ManagerProfileInner() {
  const params = useSearchParams();
  const name = params.get('name') ?? undefined;
  return <ScreenManagerProfile managerName={name} />;
}

export default function ManagerProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <ManagerProfileInner />
    </Suspense>
  );
}
