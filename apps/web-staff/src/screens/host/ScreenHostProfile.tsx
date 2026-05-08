'use client';

// ScreenHostProfile — perfil + turno da recepcionista. Match com docs/
// design-canvas/handoff/garcom/garcom-screens-host.jsx :: ScreenHostProfile.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GButton, GIconBtn, HBottomNav } from '../../components/waiter/Primitives';

interface ScreenHostProfileProps {
  hostName: string;
  hostInitials: string;
  shift?: string;
  ratingsCount?: number;
  reservationsHandled?: number;
  onBack?: () => void;
  onLogout?: () => void;
  onTabChange?: (tab: string) => void;
  onOpenMessages?: () => void;
}

export const ScreenHostProfile: React.FC<ScreenHostProfileProps> = ({
  hostName, hostInitials, shift = '17:00 — 23:00',
  ratingsCount = 0, reservationsHandled = 0,
  onBack, onLogout, onTabChange, onOpenMessages,
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
        title="Perfil"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 80px' }}>
        <div
          style={{
            width: 88, height: 88, borderRadius: 22,
            background: '#7A4FBE', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 28, fontWeight: 800, letterSpacing: -0.5,
          }}
        >
          {hostInitials}
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
          {hostName}
        </div>
        <div
          style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.faint,
            letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 4,
          }}
        >
          Recepcionista
        </div>

        <div
          style={{
            margin: '24px 0 16px', padding: 14, borderRadius: 14,
            background: C.surface, border: `1px solid ${C.borderFaint}`,
          }}
        >
          <div
            style={{
              fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
              fontWeight: 700, color: C.mute, marginBottom: 8,
            }}
          >
            Turno de hoje
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{shift}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${C.borderSoft}` }}>
            <div style={{ fontSize: 11, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>
              Reservas hoje
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{reservationsHandled}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${C.borderSoft}` }}>
            <div style={{ fontSize: 11, color: C.mute, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>
              Avaliações
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: C.warn }}>{Icon.star(18)}</span>
              {ratingsCount}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onOpenMessages}
            style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
              padding: '14px 16px', borderRadius: 12,
              border: `1.5px solid ${C.borderSoft}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <span style={{ color: C.ink }}>{Icon.chat(20)}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Mensagens</span>
            <span style={{ marginLeft: 'auto', color: C.mute }}>{Icon.arrow(16)}</span>
          </button>
        </div>

        <div style={{ marginTop: 28 }}>
          <GButton kind="danger" dark={dark} full onClick={onLogout}>
            Sair
          </GButton>
        </div>
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />
    </div>
  );
};

export default ScreenHostProfile;
