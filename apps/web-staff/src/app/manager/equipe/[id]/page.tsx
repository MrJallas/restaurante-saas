'use client';

// /manager/equipe/[id] — Onda 2 (round 18). ScreenManagerStaffDetail.

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenManagerStaffDetail } from '../../../../screens/manager/ScreenManagerStaffDetail';

function StaffDetailInner() {
  const route = useParams<{ id: string }>();
  const params = useSearchParams();
  const dark = params.get('dark') === '1';
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerStaffDetail dark={dark} staffId={route?.id ?? ''} tenantSlug={slug} />;
}

export default function ManagerStaffDetailPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <StaffDetailInner />
    </Suspense>
  );
}
