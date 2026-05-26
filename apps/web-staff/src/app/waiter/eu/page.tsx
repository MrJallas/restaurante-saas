'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterProfile } from '../../../screens/waiter/ScreenWaiterProfile';

function WaiterProfilePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const waiterId = params.get('waiterId') ?? '';
  const waiterName = params.get('name') ?? 'Garçom';
  const initials = params.get('initials') ?? undefined;

  const tabHref = (tab: 'home' | 'calls' | 'scan' | 'shift' | 'me'): string => {
    if (tab === 'home') return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}`;
    if (tab === 'calls') return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}&view=calls`;
    if (tab === 'shift') return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}&view=shift`;
    if (tab === 'me') return `/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}`;
    return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}`;
  };

  return (
    <ScreenWaiterProfile
      waiterName={waiterName}
      waiterInitials={initials}
      onBack={() => router.back()}
      onLogout={() => {
        try {
          window.sessionStorage.clear();
          window.localStorage.removeItem('staffId');
          window.localStorage.removeItem('staffRole');
          window.localStorage.removeItem('staffName');
        } catch {
          /* ignore */
        }
        router.push('/');
      }}
      onTabChange={(tab) => {
        if (tab === 'me') return;
        router.push(tabHref(tab));
      }}
      onNewEntry={() => router.push(`/waiter/new-entry?tenant=${tenantSlug}`)}
      onOpenMessages={() => router.push(`/waiter/mensagens?tenant=${tenantSlug}&waiterId=${waiterId}`)}
      onEndShift={() => router.push(`/waiter?tenant=${tenantSlug}&waiterId=${waiterId}&view=shift`)}
    />
  );
}

export default function WaiterProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterProfilePageInner />
    </React.Suspense>
  );
}
