'use client';

// ScreenWaiterProfile — perfil + turno do garçom. Mesma anatomia da
// ScreenHostProfile, adaptada pra GBottomNav (5 abas: home/calls/scan/shift/me).
// Acessível via aba "Eu" do GBottomNav.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GBottomNav, GButton, GIconBtn } from '../../components/waiter/Primitives';

export interface ScreenWaiterProfileProps {
  waiterName: string;
  waiterInitials?: string;
  shift?: string;
  tablesServed?: number;
  callsAvgMin?: number;
  rating?: number;
  onBack?: () => void;
  onLogout?: () => void;
  onTabChange?: (tab: 'home' | 'calls' | 'scan' | 'shift' | 'me') => void;
  onNewEntry?: () => void;
  onOpenMessages?: () => void;
  onOpenShift?: () => void;
}

export const ScreenWaiterProfile: React.FC<ScreenWaiterProfileProps> = ({
  waiterName,
  waiterInitials,
  shift = '17:00 — 23:00',
  tablesServed = 0,
  callsAvgMin = 0,
  rating = 0,
  onBack,
  onLogout,
  onTabChange,
  onNewEntry,
  onOpenMessages,
  onOpenShift,
}) => {
  const dark = false;
  const C = useG(dark);
  const initials =
    waiterInitials ??
    (waiterName
      ? waiterName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
      : 'EU');

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
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
            width: 88,
            height: 88,
            borderRadius: 22,
            background: '#4F6BFF',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: -0.5,
          }}
        >
          {initials}
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
          {waiterName || 'Garçom'}
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: C.faint,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          Garçom
        </div>

        <div
          style={{
            margin: '24px 0 16px',
            padding: 14,
            borderRadius: 14,
            background: C.surface,
            border: `1px solid ${C.borderFaint}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontWeight: 700,
              color: C.mute,
              marginBottom: 8,
            }}
          >
            Turno de hoje
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{shift}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Stat label="Mesas" value={tablesServed} dark={dark} />
          <Stat label="Resposta" value={`${callsAvgMin}m`} dark={dark} />
          <Stat label="Avaliação" value={rating > 0 ? rating.toFixed(1) : '—'} dark={dark} starred={rating > 0} />
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ActionLink dark={dark} icon={Icon.chat(20)} label="Mensagens" onClick={onOpenMessages} />
          <ActionLink dark={dark} icon={Icon.history(20)} label="Histórico do turno" onClick={onOpenShift} />
        </div>

        <div style={{ marginTop: 28 }}>
          <GButton kind="danger" dark={dark} full onClick={onLogout}>
            Sair
          </GButton>
        </div>
      </div>

      <GBottomNav
        active="me"
        dark={dark}
        onNewEntry={onNewEntry}
        onTabChange={(id) => onTabChange?.(id)}
      />
    </div>
  );
};

function Stat({
  label,
  value,
  dark,
  starred,
}: {
  label: string;
  value: string | number;
  dark: boolean;
  starred?: boolean;
}) {
  const C = useG(dark);
  return (
    <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${C.borderSoft}` }}>
      <div
        style={{
          fontSize: 10.5,
          color: C.mute,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {starred && <span style={{ color: C.warn }}>{Icon.star(16)}</span>}
        {value}
      </div>
    </div>
  );
}

function ActionLink({
  icon,
  label,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  dark: boolean;
}) {
  const C = useG(dark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: '14px 16px',
        borderRadius: 12,
        border: `1.5px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ color: C.ink }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: C.mute }}>{Icon.arrow(16)}</span>
    </button>
  );
}

export default ScreenWaiterProfile;
