'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenManagerProfile } from '../../../screens/manager/ScreenManagerProfile';

function ManagerProfileInner() {
  const params = useSearchParams();
  const name = params.get('name') ?? undefined;
  const slug =
    params.get('slug') ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    'restaurant_dev';
  return <ScreenManagerProfile managerName={name} tenantSlug={slug} />;
}

export default function ManagerProfilePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <ManagerProfileInner />
    </Suspense>
  );
}
