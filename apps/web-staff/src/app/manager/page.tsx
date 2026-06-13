// Manager · Painel — top-level screen.
// Tenant slug: read from `?slug=` query param OR `NEXT_PUBLIC_TENANT_SLUG`.
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenManagerHomeA } from '../../screens/manager';
import { useStaffTheme } from '../../lib/theme';

function PainelInner() {
  const params = useSearchParams();
  const { dark } = useStaffTheme();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerHomeA tenantSlug={slug} dark={dark} />;
}

export default function ManagerPainelPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <PainelInner />
    </Suspense>
  );
}
