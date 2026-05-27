'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerAppearance } from '../../../screens/manager';

function Inner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerAppearance tenantSlug={slug} />;
}

export default function ManagerAppearancePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <Inner />
    </Suspense>
  );
}
