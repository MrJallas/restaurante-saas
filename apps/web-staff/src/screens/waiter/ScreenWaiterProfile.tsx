'use client';

// ScreenWaiterProfile — perfil + turno do garçom (rota /waiter/eu).
// Faithful port of ScreenProfile em
// docs/design-canvas/handoff/garcom/garcom-screens-b.jsx:1333 (V11 layout):
// Hero centralizado · pill verde "EM TURNO · HHh MMm" · Mensagens (V11 1º
// bloco · interruptivo) · Notificações (Som · Vibrar · Avisar bar) ·
// Preferências (Setor · Tema · PIN) · Sessão (Encerrar turno · Sair em
// vermelho) · footer estabelecimento + versão.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GBottomNav, GIconBtn } from '../../components/waiter/Primitives';

export interface ScreenWaiterProfileProps {
  waiterName: string;
  waiterInitials?: string;
  /** Subtítulo abaixo do nome — ex "Garçonete · Trattoria Luna". */
  roleLabel?: string;
  /** Tempo em turno em minutos (formatado pra "03h 12m"). */
  shiftDurationMin?: number;
  /** Número de mensagens não-lidas (badge no Mensagens row). */
  unreadMessages?: number;
  /** Preferências exibidas como `value` à direita do row. */
  prefs?: {
    callSound?: string;
    delayVibration?: string;
    barReadyAlert?: string;
    defaultSector?: string;
  };
  /** Estabelecimento + versão exibidos no footer. */
  establishment?: string;
  appVersion?: string;
  dark?: boolean;
  onBack?: () => void;
  onLogout?: () => void;
  onEndShift?: () => void;
  onTabChange?: (tab: 'home' | 'calls' | 'scan' | 'shift' | 'me') => void;
  onNewEntry?: () => void;
  onOpenMessages?: () => void;
}

export const ScreenWaiterProfile: React.FC<ScreenWaiterProfileProps> = ({
  waiterName,
  waiterInitials,
  roleLabel = 'Garçom · Trattoria Luna',
  shiftDurationMin = 0,
  unreadMessages = 0,
  prefs = {},
  establishment = 'Trattoria Luna',
  appVersion = '2.4.1',
  dark = false,
  onBack,
  onLogout,
  onEndShift,
  onTabChange,
  onNewEntry,
  onOpenMessages,
}) => {
  const C = useG(dark);
  const initials =
    waiterInitials ??
    (waiterName ? waiterName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : 'EU');

  // Formata duração em "Xh YYm" pra pílula "EM TURNO · …".
  const fmtDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={onBack ? <GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" /> : undefined}
        title="Perfil"
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* HERO · centralizado · avatar 80px ink filled · pill verde com pulse */}
        <div style={{ padding: '24px 16px 20px', textAlign: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              margin: '0 auto',
              background: C.ink,
              color: C.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.5,
            }}
          >
            {initials}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 12, color: C.ink }}>
            {waiterName}
          </div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>{roleLabel}</div>
          {shiftDurationMin > 0 && (
            <div
              style={{
                display: 'inline-flex',
                gap: 8,
                marginTop: 12,
                padding: '6px 12px',
                borderRadius: 100,
                background: C.successBg,
                color: C.success,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: 'currentColor',
                  animation: 'gPulse 1.4s infinite',
                }}
              />
              Em turno · {fmtDuration(shiftDurationMin)}
            </div>
          )}
        </div>

        {/* MENSAGENS · V11 · 1º bloco · interruptivo */}
        <SectionTitle dark={dark}>Mensagens</SectionTitle>
        <CardGroup dark={dark}>
          <Row
            dark={dark}
            icon={Icon.chat(18)}
            label="Mensagens"
            sub={
              unreadMessages > 0
                ? `Histórico · ${unreadMessages} não-${unreadMessages === 1 ? 'lida' : 'lidas'}`
                : 'Histórico'
            }
            badge={unreadMessages > 0 ? unreadMessages : undefined}
            onClick={onOpenMessages}
            last
          />
        </CardGroup>

        {/* NOTIFICAÇÕES */}
        <SectionTitle dark={dark}>Notificações</SectionTitle>
        <CardGroup dark={dark}>
          <Row dark={dark} icon={Icon.bell(18)} label="Som de chamado" value={prefs.callSound ?? 'Sino curto'} />
          <Row dark={dark} icon={Icon.flame(18)} label="Vibrar em atrasos" value={prefs.delayVibration ?? 'Forte'} />
          <Row dark={dark} icon={Icon.glass(18)} label="Avisar bar pronto" value={prefs.barReadyAlert ?? 'Sempre'} last />
        </CardGroup>

        {/* PREFERÊNCIAS */}
        <SectionTitle dark={dark}>Preferências</SectionTitle>
        <CardGroup dark={dark}>
          <Row dark={dark} icon={Icon.table(18)} label="Setor padrão" value={prefs.defaultSector ?? 'Todos'} />
          <Row dark={dark} icon={Icon.settings(18)} label="Tema" value={dark ? 'Escuro' : 'Claro'} />
          <Row dark={dark} icon={Icon.user(18)} label="Editar PIN" last />
        </CardGroup>

        {/* SESSÃO · Encerrar turno + Sair em vermelho */}
        <SectionTitle dark={dark}>Sessão</SectionTitle>
        <CardGroup dark={dark} marginBottom>
          <Row dark={dark} icon={Icon.clock(18)} label="Encerrar turno" onClick={onEndShift} />
          <Row dark={dark} icon={Icon.back(18)} label="Sair da conta" danger onClick={onLogout} last />
        </CardGroup>

        {/* FOOTER · estabelecimento + versão */}
        <div style={{ textAlign: 'center', fontSize: 11, color: C.faint, padding: 16 }}>
          {establishment} · v {appVersion}
        </div>
      </div>

      <GBottomNav active="me" dark={dark} onTabChange={onTabChange} onNewEntry={onNewEntry} />

      <style jsx global>{`
        @keyframes gPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
};

// ─── SectionTitle — eyebrow mono caps acima de cada CardGroup.
function SectionTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: '20px 16px 8px',
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: C.mute,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

// ─── CardGroup — wrapper com border + radius pra agrupar Rows.
function CardGroup({
  children,
  dark,
  marginBottom = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
  marginBottom?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.borderFaint}`,
        margin: marginBottom ? '0 16px 20px' : '0 16px',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ─── Row — linha do canvas garcom (icon 32×32 surface · label · value · ›).
function Row({
  icon,
  label,
  value,
  badge,
  sub,
  danger,
  last,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: number;
  sub?: string;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: onClick ? 'pointer' : 'default',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderBottom: last ? 'none' : `1px solid ${C.borderFaint}`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: danger ? C.dangerBg : C.surface,
          color: danger ? C.danger : C.mute,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: danger ? C.danger : C.ink }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 500, marginTop: 2 }}>{sub}</div>
        )}
      </div>
      {badge != null && badge > 0 && (
        <span
          style={{
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 10,
            background: '#C43A3A',
            color: '#fff',
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
      {value && <div style={{ fontSize: 13, color: C.mute }}>{value}</div>}
      {!danger && <span style={{ color: C.faint }}>›</span>}
    </Tag>
  );
}

export default ScreenWaiterProfile;
