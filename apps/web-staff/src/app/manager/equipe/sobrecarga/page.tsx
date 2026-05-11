'use client';

// /manager/equipe/sobrecarga — Round 18 Onda 4. ScreenManagerStaffSobrecarga V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerStaffSobrecarga } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerStaffSobrecarga tenantSlug={slug} />;
}

export default function ManagerSobrecargaPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
