// Waiter · Notificações — destino do sino do header em todo waiter UI.
// Round 18 placebo-fix (audit-report Onda 18). O waiter consome o mesmo
// feed operacional de alertas, então reusa o screen do manager com
// `persona='manager'` (bottom-nav manager-style por ora — quando o waiter
// ganhar nav própria pra alerts, trocar pra persona dedicada).
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

export default function WaiterNotificationsPage() {
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
