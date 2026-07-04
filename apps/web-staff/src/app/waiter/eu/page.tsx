'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterProfile } from '../../../screens/waiter/ScreenWaiterProfile';
import { readStaffSession } from '../../../lib/api';
import { requestWaiterShiftEnd } from '../../../lib/api/waiter';
import { useStaffTheme } from '../../../lib/theme';
import { useG, G_FONT } from '../../../components/waiter/tokens';

function WaiterProfilePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'demo';
  const [sessionWaiterId, setSessionWaiterId] = React.useState('');
  const waiterId = params.get('waiterId') ?? sessionWaiterId;
  const waiterName = params.get('name') ?? 'Garçom';
  const initials = params.get('initials') ?? undefined;
  const { dark } = useStaffTheme();
  const C = useG(dark);
  const [endingShift, setEndingShift] = React.useState(false);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const showToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2800);
  };

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
    <>
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
        onEditPin={() => router.push('/trocar-pin')}
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
          } catch (error) {
            // Falha na solicitação: NÃO navegar (navegar fingiria sucesso).
            console.error('[waiter-profile] shift end request failed', error);
            showToast('Não foi possível solicitar o encerramento do turno. Tente novamente.');
          } finally {
            setEndingShift(false);
          }
        }}
      />
      {toastMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 90,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontFamily: G_FONT,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}

export default function WaiterProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterProfilePageInner />
    </React.Suspense>
  );
}
