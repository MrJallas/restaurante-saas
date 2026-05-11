'use client';

// /manager/operacoes/em-alerta — Round 18 Onda 4. ScreenManagerOpsEmAlerta V9.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerOpsEmAlerta } from '../../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerOpsEmAlerta tenantSlug={slug} />;
}

export default function ManagerEmAlertaPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <Inner />
    </Suspense>
  );
}
