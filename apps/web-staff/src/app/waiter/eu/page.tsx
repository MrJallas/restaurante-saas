'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterProfile } from '../../../screens/waiter/ScreenWaiterProfile';
import { readStaffSession } from '../../../lib/api';
import { requestWaiterShiftEnd } from '../../../lib/api/waiter';
import { useStaffTheme } from '../../../lib/theme';

function WaiterProfilePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const [sessionWaiterId, setSessionWaiterId] = React.useState('');
  const waiterId = params.get('waiterId') ?? sessionWaiterId;
  const waiterName = params.get('name') ?? 'Garçom';
  const initials = params.get('initials') ?? undefined;
  const { dark } = useStaffTheme();
  const [endingShift, setEndingShift] = React.useState(false);

  React.useEffect(() => {
    setSessionWaiterId(readStaffSession()?.staffId ?? '');
  }, []);

  const tabHref = (tab: 'home' | 'calls' | 'scan' | 'shift' | 'me'): string => {
    if (tab === 'home') return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}`;
    if (tab === 'calls') return `/waiter/chamados?tenant=${tenantSlug}&waiterId=${waiterId}`;
    if (tab === 'shift') return `/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}&focus=shift`;
    if (tab === 'me') return `/waiter/eu?tenant=${tenantSlug}&waiterId=${waiterId}`;
    return `/waiter?tenant=${tenantSlug}&waiterId=${waiterId}`;
  };

  return (
    <ScreenWaiterProfile
      waiterName={waiterName}
      waiterInitials={initials}
      dark={dark}
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
      onOpenMessages={() =>
        router.push(`/waiter/mensagens?tenant=${tenantSlug}&waiterId=${waiterId}`)
      }
      onEndShift={async () => {
        if (endingShift) return;
        setEndingShift(true);
        try {
          const request = await requestWaiterShiftEnd(tenantSlug, {});
          if (request.threadId) {
            router.push(
              `/waiter/mensagens/${request.threadId}?tenant=${tenantSlug}&waiterId=${waiterId}`,
            );
          } else {
            router.push(`/waiter/mensagens?tenant=${tenantSlug}&waiterId=${waiterId}`);
          }
        } catch {
          router.push(`/waiter/mensagens?tenant=${tenantSlug}&waiterId=${waiterId}`);
        } finally {
          setEndingShift(false);
        }
      }}
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
