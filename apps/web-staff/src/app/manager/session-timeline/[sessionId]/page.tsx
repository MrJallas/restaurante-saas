'use client';

// /manager/session-timeline/[sessionId] — fatia M7. Timeline completa da
// SESSÃO (event store, endpoints M6) — irmã da /manager/timeline/[orderId]
// (que é per-pedido). Slug resolvido como nos pares (mesa/[n]): querystring
// → NEXT_PUBLIC_TENANT_SLUG → 'demo'.

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ScreenManagerSessionTimeline } from '../../../../screens/manager/ScreenManagerSessionTimeline';

function SessionTimelineInner() {
  const route = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const slug = search.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  const dark = search.get('dark') === '1';
  return (
    <ScreenManagerSessionTimeline dark={dark} slug={slug} sessionId={route?.sessionId ?? ''} />
  );
}

export default function ManagerSessionTimelinePage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <SessionTimelineInner />
    </Suspense>
  );
}
