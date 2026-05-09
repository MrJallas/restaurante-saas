'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScreenStaffMessages } from '../../../screens/manager';

function MsgInner() {
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  // P1 #18 — backend StaffQueryDto requires staffId. Passed via the
  // ?managerId=<uuid> query (see MBottomNav links / login flow).
  const managerId = params.get('managerId') || params.get('staffId') || undefined;
  return <ScreenStaffMessages tenantSlug={slug} managerId={managerId} />;
}

export default function ManagerMessagesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <MsgInner />
    </Suspense>
  );
}
