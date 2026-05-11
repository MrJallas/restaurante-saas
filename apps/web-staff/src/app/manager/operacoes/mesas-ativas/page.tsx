'use client';

// /manager/operacoes/mesas-ativas — Round 18 Onda 4. ScreenManagerOpsMesasAtivas V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOpsMesasAtivas } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerOpsMesasAtivas tenantSlug={slug} />;
}

export default function ManagerMesasAtivasPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
