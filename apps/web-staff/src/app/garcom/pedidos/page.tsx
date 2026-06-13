'use client';

// Rota legada arquivada (decisão de produto 2026-06-10, prompt 99 §8):
// /garcom/pedidos era a lista KDS/manual antiga do garçom e a única
// superfície que montava o WaiterAlerts (banner de entrega). O fluxo de
// entrega vive agora nas telas V20: banner global em /waiter/* via
// WaiterDeliveryAlerts, lista em /waiter/chamados (aba Pronto) e ação
// final em /waiter/entrega/[orderId]. Redireciona pra não quebrar
// bookmarks/links antigos.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { defaultTenantSlug } from '../../../lib/api';

export default function GarcomPedidosLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    // defaultTenantSlug() também honra NEXT_PUBLIC_DEFAULT_TENANT — o env
    // literal fixava restaurant_dev em deploys configurados só por essa
    // var (code-review).
    router.replace(`/waiter?tenant=${defaultTenantSlug()}`);
  }, [router]);
  return null;
}
