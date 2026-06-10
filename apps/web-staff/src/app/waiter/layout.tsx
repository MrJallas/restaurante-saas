'use client';

// Layout do segmento /waiter/* — monta o banner de entrega pendente
// (WaiterDeliveryAlerts) em TODAS as telas do garçom, pra notificação
// in-app do handoff cozinha/bar chegar mesmo fora da home.

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { WaiterDeliveryAlerts } from '../../components/waiter/WaiterDeliveryAlerts';
import { defaultTenantSlug, readStaffSession } from '../../lib/api';
import { useStaffTheme } from '../../lib/theme';

function WaiterAlertsMount() {
  const params = useSearchParams();
  const { dark } = useStaffTheme();
  const tenantSlug = params.get('tenant') ?? defaultTenantSlug();
  const [waiterId, setWaiterId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const session = readStaffSession();
    setWaiterId(params.get('waiterId') ?? session?.staffId ?? null);
  }, [params]);

  return <WaiterDeliveryAlerts tenantSlug={tenantSlug} waiterId={waiterId} dark={dark} />;
}

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <React.Suspense fallback={null}>
        <WaiterAlertsMount />
      </React.Suspense>
      {children}
    </>
  );
}
