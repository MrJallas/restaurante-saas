'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenStaffMessageCompose } from '../../../../screens/manager';

function NewMessageInner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const managerId = params.get('managerId') || params.get('staffId') || undefined;
  return <ScreenStaffMessageCompose tenantSlug={slug} managerId={managerId} />;
}

export default function ManagerNewMessagePage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando...</div>}
    >
      <NewMessageInner />
    </Suspense>
  );
}
