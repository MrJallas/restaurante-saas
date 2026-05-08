'use client';

// ScreenWaiterScanQr — câmera/viewfinder pra escanear o QR da mesa.
// Match com docs/design-canvas/handoff/garcom/garcom-screens-b.jsx ::
// ScreenWaiterScanQr. Fundo SEMPRE escuro.
//
// Tap no fallback ("Inserir número da mesa") leva pro picker.

import * as React from 'react';
import { Icon } from '../../components/waiter/Icons';
import { G_FONT } from '../../components/waiter/tokens';

interface ScreenWaiterScanQrProps {
  onClose?: () => void;
  onManualEntry?: () => void;
  onScanned?: (tableCode: string) => void;
}

export const ScreenWaiterScanQr: React.FC<ScreenWaiterScanQrProps> = ({
  onClose, onManualEntry,
}) => {
  const bg = '#0a0a0a';

  return (
    <div
      style={{
        width: '100%', minHeight: '100vh', background: bg, color: '#fff',
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
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          {Icon.x(18)}
        </button>
        <div
          style={{
            fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase',
            fontWeight: 700, color: 'rgba(255,255,255,0.7)',
          }}
        >
          Câmera
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '0 24px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginTop: 18 }}>
          Escaneie a mesa
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.4 }}>
          Posicione o QR code da mesa dentro da moldura para começar o atendimento.
        </div>
      </div>

      {/* Viewfinder */}
      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', minHeight: 320,
        }}
      >
        <div style={{ position: 'relative', width: 240, height: 240 }}>
          {[
            { top: 0, left: 0, borderTop: '3px solid #fff', borderLeft: '3px solid #fff', borderTopLeftRadius: 14 },
            { top: 0, right: 0, borderTop: '3px solid #fff', borderRight: '3px solid #fff', borderTopRightRadius: 14 },
            { bottom: 0, left: 0, borderBottom: '3px solid #fff', borderLeft: '3px solid #fff', borderBottomLeftRadius: 14 },
            { bottom: 0, right: 0, borderBottom: '3px solid #fff', borderRight: '3px solid #fff', borderBottomRightRadius: 14 },
          ].map((s, i) => (
            <span key={i} style={{ position: 'absolute', width: 36, height: 36, ...(s as React.CSSProperties) }} />
          ))}
          <div
            style={{
              position: 'absolute', left: 8, right: 8, top: '50%',
              height: 2,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
              boxShadow: '0 0 14px rgba(255,255,255,0.6)',
              animation: 'gPulse 1.6s infinite ease-in-out',
            }}
          />
        </div>
      </div>

      <div
        style={{
          padding: '8px 16px 36px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}
        >
          QR ilegível?
        </div>
        <button
          type="button"
          onClick={onManualEntry}
          style={{
            all: 'unset', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
            letterSpacing: -0.1,
            textDecoration: 'underline', textUnderlineOffset: 4,
          }}
        >
          Inserir número da mesa
        </button>
      </div>
    </div>
  );
};

export default ScreenWaiterScanQr;
