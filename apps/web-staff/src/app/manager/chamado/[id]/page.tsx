'use client';

import { Suspense } from 'react';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenCallDetail, type CallDetailKind } from '../../../../screens/manager';

function CallInner() {
  const route = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const tenantId = params.get('tenantId') || process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';
  const kind = (params.get('kind') as CallDetailKind | null) ?? 'generic';
  useEffect(() => {
    if (kind !== 'complaint') return;
    const qs = new URLSearchParams({ slug, replyComplaint: route.id });
    router.replace(`/manager?${qs.toString()}`);
  }, [kind, route.id, router, slug]);
  if (kind === 'complaint') {
    return <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Abrindo resposta…</div>;
  }
  return <ScreenCallDetail tenantSlug={slug} tenantId={tenantId} id={route.id} kind={kind} />;
}

export default function ManagerCallDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}>
      <CallInner />
    </Suspense>
  );
}
