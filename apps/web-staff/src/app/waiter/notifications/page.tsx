// Waiter · Notificações — destino do sino do header em todo waiter UI.
// O feed `/alerts` é role-aware pelo `x-staff-id`; a persona aqui só
// controla navegação e evita bottom nav de gerente dentro do app do garçom.
'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenManagerNotifications } from '../../../screens/manager/ScreenManagerNotifications';

function NotificationsInner() {
  const params = useSearchParams();
  const slug =
    params.get('tenant') || params.get('slug') || process.env.NEXT_PUBLIC_TENANT_SLUG || 'demo';
  return <ScreenManagerNotifications tenantSlug={slug} persona="waiter" />;
}

export default function WaiterNotificationsPage() {
  return (
    <Suspense
      fallback={<div style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>Carregando…</div>}
    >
      <NotificationsInner />
    </Suspense>
  );
}
