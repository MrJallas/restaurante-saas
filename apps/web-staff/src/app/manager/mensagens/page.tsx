'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/manager';

function MsgInner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenStaffMessages tenantSlug={slug} />;
}

export default function ManagerMessagesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <MsgInner />
    </Suspense>
  );
}
