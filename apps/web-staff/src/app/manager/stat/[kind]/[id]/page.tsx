'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenManagerStatDetail, type StatKind } from '../../../../../screens/manager';

function StatInner() {
  const route = useParams<{ kind: string; id: string }>();
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return (
    <ScreenManagerStatDetail
      tenantSlug={slug}
      kind={(route.kind as StatKind) ?? 'generic-call'}
      id={route.id}
    />
  );
}

export default function ManagerStatDetailPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <StatInner />
    </Suspense>
  );
}
