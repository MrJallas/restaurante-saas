'use client';

// /manager/operacoes/atencao — Round 18 Onda 4. ScreenManagerOpsAtencao V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOpsAtencao } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerOpsAtencao tenantSlug={slug} />;
}

export default function ManagerAtencaoPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
