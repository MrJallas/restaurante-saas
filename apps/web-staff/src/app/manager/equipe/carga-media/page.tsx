'use client';

// /manager/equipe/carga-media — Round 18 Onda 4. ScreenManagerStaffCargaMedia V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerStaffCargaMedia } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerStaffCargaMedia tenantSlug={slug} />;
}

export default function ManagerCargaMediaPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
