'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScreenWaiterDeliveryConfirm } from '../../../../screens/waiter/ScreenWaiterDeliveryConfirm';
import { staffPost } from '../../../../lib/api';

function WaiterDeliveryConfirmPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantSlug = params.get('tenant') ?? '';
  const tableCode = params.get('table') ?? '';
  const orderId = params.get('orderId') ?? '';

  // Items would normally come from the order endpoint; placeholder until route hits it.
  const items = [
    { q: 1, n: 'Risoto de camarão' },
    { q: 1, n: 'Filé ao vinho', note: 'sem cogumelos' },
  ];

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // P1 #15: o botao "Confirmar entrega" nao chamava a API antes —
  // so navegava de volta pro /waiter, deixando o pedido travado em
  // status `ready` no banco. Agora promovemos pra `delivered` via
  // PATCH /:slug/orders/:orderId/status (mesmo endpoint do KDS e
  // da tela de pedidos do garcom). Quando nao temos `orderId` na
  // query — o picker upstream ainda nao expoe — degradamos
  // silenciosamente pra navigation-only com aviso, em vez de
  // 404ar a API com id vazio.
  const handleConfirm = async () => {
    if (!tenantSlug) {
      setError('Tenant nao identificado · volte e escaneie o QR de novo.');
      return;
    }
    if (!orderId) {
      // Upstream (table picker / QR scan) ainda nao passa o orderId.
      // Mantemos o flow de UX (navigate de volta) mas sinalizamos que
      // a confirmacao vai precisar ser refeita via /garcom/pedidos.
      setError(
        'Pedido nao identificado neste fluxo · marque entregue pela aba "Pedidos".',
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await staffPost(`/${tenantSlug}/orders/${orderId}/delivered`, {});
      router.push(`/waiter?tenant=${tenantSlug}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao confirmar entrega';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ScreenWaiterDeliveryConfirm
        tableLabel={`Mesa ${tableCode || '—'}`}
        tableTimeAgo="agora"
        items={items}
        onCancel={() => router.back()}
        onBack={() => router.back()}
        onConfirm={handleConfirm}
        loading={loading}
      />
      {error && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 'max(env(safe-area-inset-bottom), 16px)',
            padding: '12px 14px',
            borderRadius: 12,
            background: '#7a1f1f',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            zIndex: 50,
            boxShadow: '0 10px 24px -8px rgba(0,0,0,0.35)',
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

export default function WaiterDeliveryConfirmPage() {
  return (
    <React.Suspense fallback={null}>
      <WaiterDeliveryConfirmPageInner />
    </React.Suspense>
  );
}
