'use client';

// ScreenHostProfile — perfil + turno da recepcionista (rota /host/eu).
// Faithful port of ScreenHostProfile em
// docs/design-canvas/handoff/garcom/garcom-screens-host.jsx:2453 (V11 layout):
// Hero (avatar 76 lado-a-lado · pulse "em turno desde HH:MM") · Mensagens
// (V11 1º bloco) · KPI "Suas liberações no turno" · Operação (Histórico de
// turnos) · Conta (Notificações · Segurança · Aparência) · Sair · footer.

import * as React from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GIconBtn, HBottomNav } from '../../components/waiter/Primitives';

interface ScreenHostProfileProps {
  hostName: string;
  hostInitials?: string;
  hostColor?: string;
  /** Subtítulo · ex "Recepcionista". */
  roleLabel?: string;
  /** Subtítulo do shift · ex "17:00 — 23:00". */
  shift?: string;
  /** Ex "17:08" — usado no pulse "em turno desde …". */
  shiftStartedAt?: string;
  /** Mensagens não-lidas (badge). */
  unreadMessages?: number;
  /** Notificações pendentes (badge bell). */
  bellBadge?: number;
  /** Mesas liberadas no turno atual. */
  tablesReleasedThisShift?: number;
  reservationsThisShift?: number;
  walkinsThisShift?: number;
  /** Espera média em minutos. */
  avgWaitMin?: number;
  appVersion?: string;
  buildDate?: string;
  establishment?: string;
  onBack?: () => void;
  onLogout?: () => void;
  onTabChange?: (tab: string) => void;
  onOpenMessages?: () => void;
}

export const ScreenHostProfile: React.FC<ScreenHostProfileProps> = ({
  hostName,
  hostInitials,
  hostColor = '#7A4FBE',
  roleLabel = 'Recepcionista',
  shift = 'Turno da noite (17h–23h)',
  shiftStartedAt = '17:08',
  unreadMessages = 0,
  bellBadge = 0,
  tablesReleasedThisShift,
  reservationsThisShift,
  walkinsThisShift,
  avgWaitMin,
  appVersion = '1.1.0',
  buildDate = '2026-05-08',
  establishment,
  onLogout,
  onTabChange,
  onOpenMessages,
}) => {
  const dark = false;
  const C = useG(dark);
  const initials =
    hostInitials ?? (hostName ? hostName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() : 'EU');

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* TopBar minimal · Eu é aba */}
        <div
          style={{
            padding: '14px 16px 12px',
            background: C.surface,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Eu</h1>
          <GIconBtn dark={dark} icon={Icon.bell(20)} badge={bellBadge > 0 ? String(bellBadge) : undefined} ariaLabel="Notificações" />
        </div>

        {/* HERO · avatar lado-a-lado · pulse em turno */}
        <div
          style={{
            padding: '20px 16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: hostColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.3,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>{hostName}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3, fontWeight: 600 }}>
              {roleLabel} · {shift}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#1E8C5A',
                marginTop: 6,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#1E8C5A',
                  animation: 'gPulse 2s infinite',
                }}
              />
              em turno desde {shiftStartedAt}
            </div>
          </div>
        </div>

        {/* MENSAGENS · V11 · 1º bloco */}
        <SectionTitle dark={dark}>Mensagens</SectionTitle>
        <div style={{ padding: '0 16px' }}>
          <ActionRow
            dark={dark}
            icon={Icon.chat(18)}
            lbl="Mensagens"
            sub={
              unreadMessages > 0
                ? `Histórico · ${unreadMessages} não-${unreadMessages === 1 ? 'lida' : 'lidas'}`
                : 'Histórico'
            }
            badge={unreadMessages > 0 ? unreadMessages : undefined}
            onClick={onOpenMessages}
          />
        </div>

        {/* KPI · Suas liberações no turno */}
        {tablesReleasedThisShift != null && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
              }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Suas liberações no turno
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: -0.6,
                  marginTop: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tablesReleasedThisShift}
                <span style={{ fontSize: 14, color: C.faint, fontWeight: 600, marginLeft: 6 }}>mesas</span>
              </div>
              {(reservationsThisShift != null || walkinsThisShift != null || avgWaitMin != null) && (
                <div style={{ fontSize: 11.5, color: '#1E8C5A', marginTop: 4, fontWeight: 700 }}>
                  ↑{' '}
                  {[
                    reservationsThisShift != null ? `${reservationsThisShift} reservas` : null,
                    walkinsThisShift != null ? `${walkinsThisShift} walkins` : null,
                    avgWaitMin != null ? `espera média ${avgWaitMin} min` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
                Só o que você liberou desde {shiftStartedAt}. Histórico do dia inteiro fica em Avisos &gt; resumo.
              </div>
            </div>
          </div>
        )}

        {/* OPERAÇÃO · só Histórico (V11 · Mensagens saiu daqui) */}
        <SectionTitle dark={dark}>Operação</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionRow
            dark={dark}
            icon={Icon.history(18)}
            lbl="Histórico de turnos"
            sub="Liberações, esperas e reservas dos turnos passados"
          />
        </div>

        {/* CONTA */}
        <SectionTitle dark={dark}>Conta</SectionTitle>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionRow dark={dark} icon={Icon.bell(18)} lbl="Notificações" sub="Avisos do turno · push · sons · lock screen" />
          <ActionRow dark={dark} icon={Icon.shield(18)} lbl="Segurança e senha" sub="Trocar senha · 2FA · sessões ativas" />
          <ActionRow dark={dark} icon={Icon.flame(18)} lbl="Aparência" sub="Modo claro · escuro · automático" />
        </div>

        {/* SAIR · destrutivo brick */}
        <div style={{ padding: '24px 16px 16px' }}>
          <button
            type="button"
            onClick={onLogout}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid #F4C7C7',
              background: '#FFF1F1',
              color: '#A12626',
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            Sair do app
          </button>
          <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            Versão {appVersion} · build {buildDate}
            {establishment && (
              <>
                <br />
                {establishment}
              </>
            )}
          </div>
        </div>
      </div>

      <HBottomNav active="me" dark={dark} onTabChange={(id) => onTabChange?.(id)} />

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

// ─── SectionTitle — eyebrow mono caps no padrão MSection.
function SectionTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const C = useG(!!dark);
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          padding: '0 16px 8px',
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── ActionRow — mesma anatomia do canvas (icon 36×36 acentuado · arrow).
function ActionRow({
  icon,
  lbl,
  sub,
  badge,
  danger,
  onClick,
  dark,
}: {
  icon: React.ReactNode;
  lbl: string;
  sub?: string;
  badge?: number;
  danger?: boolean;
  onClick?: () => void;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: danger ? '#FFE9E9' : '#F4F0E8',
          color: danger ? '#A12626' : C.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#A12626' : C.ink, letterSpacing: -0.1 }}>
          {lbl}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
            {sub}
          </div>
        )}
      </div>
      {badge != null && badge > 0 && (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: '0 7px',
            borderRadius: 11,
            background: '#C43A3A',
            color: '#fff',
            fontSize: 11,
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
      <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
    </button>
  );
}

export default ScreenHostProfile;
