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

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

export default function GarcomPedidosLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/waiter?tenant=${TENANT_SLUG}`);
  }, [router]);
  return null;
}
