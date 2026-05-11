'use client';

// ScreenWaiterNewEntry — chooser modal aberto pela aba "Novo".
// V4: 3 caminhos · Cliente Nova Visita / Pedido Direto / Reservar.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-b.jsx ::
// ScreenWaiterNewEntry (extendido pra 3 cards).

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';

interface ScreenWaiterNewEntryProps {
  onClose?: () => void;
  onScanQr?: () => void;
  onPedidoDireto?: () => void;
  onReservar?: () => void;
  onContactManager?: () => void;
  dark?: boolean;
}

interface CardProps {
  title: string;
  sub: string;
  icon: React.ReactNode;
  primary?: boolean;
  onClick: () => void;
  C: ReturnType<typeof useG>;
}

const Card: React.FC<CardProps> = ({ title, sub, icon, primary, onClick, C }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
      padding: '20px 18px', borderRadius: 16,
      background: primary ? C.ink : C.bg,
      color: primary ? '#fff' : C.ink,
      border: primary ? 'none' : `1.5px solid ${C.borderSoft}`,
      display: 'flex', alignItems: 'center', gap: 16,
      minHeight: 96,
    }}
  >
    <div
      style={{
        width: 56, height: 56, borderRadius: 14,
        background: primary ? 'rgba(255,255,255,0.10)' : C.surface,
        color: primary ? '#fff' : C.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{title}</div>
      <div
        style={{
          fontSize: 12, fontWeight: 500,
          color: primary ? 'rgba(255,255,255,0.7)' : C.mute,
          marginTop: 4, lineHeight: 1.4,
        }}
      >
        {sub}
      </div>
    </div>
    <span style={{ color: primary ? 'rgba(255,255,255,0.6)' : C.faint, flexShrink: 0 }}>{Icon.arrow(18)}</span>
  </button>
);

export const ScreenWaiterNewEntry: React.FC<ScreenWaiterNewEntryProps> = ({
  onClose, onScanQr, onPedidoDireto, onReservar, onContactManager, dark = false,
}) => {
  const C = useG(dark);

  return (
    <div
      style={{
        width: '100%', height: '100vh', background: C.surface, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column', position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '54px 16px 12px',
        }}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          style={{
            all: 'unset', cursor: 'pointer',
            width: 40, height: 40, borderRadius: 20,
            background: C.bg, border: `1px solid ${C.borderSoft}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink,
          }}
        >
          {Icon.x(18)}
        </button>
        <div
          style={{
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            fontWeight: 700, color: C.faint,
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}
        >
          Nova interação
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '24px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: C.ink, lineHeight: 1.2 }}>
          Como vai começar?
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 8, lineHeight: 1.5, fontWeight: 500 }}>
          Escolha o caminho · cliente nova visita, pedido direto ou reservar.
        </div>
      </div>

      <div style={{ flex: 1, padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card
          C={C}
          primary
          icon={Icon.qr(40)}
          title="Cliente nova visita"
          sub="Escanear o QR da mesa · ação principal"
          onClick={() => onScanQr?.()}
        />
        <Card
          C={C}
          icon={Icon.fork(28)}
          title="Pedido direto"
          sub="Lançar comanda em mesa que você já atende"
          onClick={() => onPedidoDireto?.()}
        />
        <Card
          C={C}
          icon={Icon.clock(28)}
          title="Reservar"
          sub="Marcar mesa pra cliente que vai chegar mais tarde"
          onClick={() => onReservar?.()}
        />
      </div>

      <div style={{ padding: '20px 16px 32px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={onContactManager}
          style={{
            all: 'unset', cursor: 'pointer',
            fontSize: 11, color: C.faint, fontWeight: 700,
            letterSpacing: 0.7, textTransform: 'uppercase',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            textDecoration: 'underline', textUnderlineOffset: 4,
          }}
        >
          O QR da mesa tá ilegível? Contactar gerente
        </button>
      </div>
    </div>
  );
};

export default ScreenWaiterNewEntry;
