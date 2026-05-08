'use client';

// ScreenWaiterDeliveryConfirm — handshake final ao entregar bandeja.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-b.jsx ::
// ScreenWaiterDeliveryConfirm.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn } from '../../components/waiter/Primitives';

interface DeliveryItem {
  q: number;
  n: string;
  note?: string | null;
}

interface ScreenWaiterDeliveryConfirmProps {
  tableLabel?: string;
  tableTimeAgo?: string;
  items: DeliveryItem[];
  onCancel?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  loading?: boolean;
}

export const ScreenWaiterDeliveryConfirm: React.FC<ScreenWaiterDeliveryConfirmProps> = ({
  tableLabel = 'Mesa', tableTimeAgo = 'há 0 minutos', items,
  onCancel, onConfirm, onBack, loading,
}) => {
  const dark = false;
  const C = useG(dark);

  return (
    <div
      style={{
        width: '100%', minHeight: '100vh', background: C.bg, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        title="Entrega"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 24px' }}>
        <div style={{ background: C.success, color: '#fff', padding: '28px 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.9 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(255,255,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {Icon.check(18)}
            </div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Pedido pronto
            </div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6, marginTop: 18, lineHeight: 1 }}>
            Pedido entregue
          </div>
          <div style={{ fontSize: 14, marginTop: 8, opacity: 0.92 }}>
            {tableLabel} · {tableTimeAgo}
          </div>
          <div style={{ fontSize: 13, marginTop: 14, opacity: 0.85, lineHeight: 1.5 }}>
            Confirme com os seus clientes se está tudo certo antes de marcar como entregue.
          </div>
        </div>

        <div
          style={{
            padding: '20px 16px 6px',
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            color: C.mute, fontWeight: 700,
          }}
        >
          Itens da bandeja
        </div>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 16px', borderBottom: `1px solid ${C.borderFaint}`,
            }}
          >
            <div
              style={{
                minWidth: 30, height: 30, borderRadius: 8, padding: '0 8px',
                background: C.surface, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}
            >
              {it.q}×
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.n}</div>
              {it.note && (
                <div style={{ fontSize: 12, color: C.mute, marginTop: 2, fontStyle: 'italic' }}>
                  ↳ {it.note}
                </div>
              )}
            </div>
          </div>
        ))}

        <div
          style={{
            margin: '18px 16px 0', padding: '14px 16px',
            background: `${C.warn}1f`, border: `1px solid ${C.warn}44`,
            borderRadius: 14, display: 'flex', gap: 10,
          }}
        >
          <span style={{ color: C.warn, fontSize: 18, lineHeight: 1, marginTop: 1 }}>!</span>
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
            Se o cliente apontar item errado ou faltando, toque <b>Cancelar</b> e abra
            <b> chamado para a cozinha</b> antes de sair da mesa.
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex', gap: 10, padding: '12px 16px 18px',
          borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
          position: 'sticky', bottom: 0,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            flex: 1, height: 52, borderRadius: 14, border: `1px solid ${C.border}`,
            background: 'transparent', color: C.ink, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, fontFamily: G_FONT,
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          style={{
            flex: 2, height: 52, borderRadius: 14, border: 'none',
            background: C.ink, color: C.bg, cursor: loading ? 'wait' : 'pointer',
            fontSize: 15, fontWeight: 700, fontFamily: G_FONT, letterSpacing: -0.2,
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? 'Enviando...' : 'Confirmar entrega'}
        </button>
      </div>
    </div>
  );
};

export default ScreenWaiterDeliveryConfirm;
