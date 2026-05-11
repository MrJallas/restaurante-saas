// Manager · Notificações — destino do sino do MAppHeader em todo manager UI.
// Round 18 placebo-fix (audit-report Onda 18). Tenant slug: `?slug=` query
// param OR `NEXT_PUBLIC_TENANT_SLUG`.
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenManagerNotifications } from '../../../screens/manager/ScreenManagerNotifications';

function NotificationsInner() {
  const params = useSearchParams();
  const slug =
    params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerNotifications tenantSlug={slug} persona="manager" />;
}

export default function ManagerNotificationsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
          Carregando…
        </div>
      }
    >
      <NotificationsInner />
    </Suspense>
  );
}
