'use client';

// /manager/operacoes/criticos — Round 18 Onda 4. ScreenManagerOpsCriticos V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOpsCriticos } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerOpsCriticos tenantSlug={slug} />;
}

export default function ManagerCriticosPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
