'use client';

// Primitives portados de garcom-screens-a.jsx
import * as React from 'react';
import { useG, G_FONT } from './tokens';
import { Icon } from './Icons';

type Tone = 'ink' | 'danger' | 'success' | 'info' | 'warn' | 'soft';

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  dark?: boolean;
  dot?: boolean;
  pulse?: boolean;
}

export const GBadge: React.FC<BadgeProps> = ({
  tone = 'ink',
  children,
  dark = false,
  dot,
  pulse,
}) => {
  const C = useG(dark);
  const map: Record<Tone, { bg: string; fg: string; bd: string }> = {
    ink: {
      bg: dark ? `${C.ink}22` : '#0a0a0a',
      fg: dark ? C.ink : '#fff',
      bd: dark ? C.ink : '#0a0a0a',
    },
    danger: { bg: C.dangerBg, fg: C.danger, bd: C.danger },
    success: { bg: C.successBg, fg: C.success, bd: C.success },
    info: { bg: C.infoBg, fg: C.info, bd: C.info },
    warn: { bg: C.warnBg, fg: C.warn, bd: C.warn },
    soft: { bg: 'transparent', fg: C.mute, bd: C.borderSoft },
  };
  const t = map[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 100,
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
      }}
    >
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: 'currentColor',
            animation: pulse ? 'gPulse 1.4s infinite' : 'none',
          }}
        />
      )}
      {children}
    </span>
  );
};

interface ButtonProps {
  children: React.ReactNode;
  full?: boolean;
  kind?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  dark?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export const GButton: React.FC<ButtonProps> = ({
  children,
  full,
  kind = 'primary',
  dark = false,
  icon,
  onClick,
  type = 'button',
  disabled,
}) => {
  const C = useG(dark);
  const styles = {
    primary: { bg: C.ink, fg: C.bg, bd: C.ink },
    secondary: { bg: 'transparent', fg: C.ink, bd: C.ink },
    danger: { bg: C.danger, fg: '#fff', bd: C.danger },
    success: { bg: C.success, fg: '#fff', bd: C.success },
    ghost: { bg: 'transparent', fg: C.mute, bd: 'transparent' },
  } as const;
  const s = styles[kind];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 20px',
        borderRadius: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: G_FONT,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: -0.1,
        background: s.bg,
        color: s.fg,
        border: `1.5px solid ${s.bd}`,
        width: full ? '100%' : 'auto',
        minHeight: 48,
        textAlign: 'center',
      }}
    >
      {icon}
      {children}
    </button>
  );
};

interface AppHeaderProps {
  left?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  dark?: boolean;
  sub?: string;
}

export const GAppHeader: React.FC<AppHeaderProps> = ({ left, title, right, dark = false, sub }) => {
  const C = useG(dark);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.borderFaint}`,
        background: C.bg,
      }}
    >
      <div style={{ width: 44 }}>{left}</div>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: C.ink }}>
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11,
              color: C.mute,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
};

interface IconBtnProps {
  icon: React.ReactNode;
  dark?: boolean;
  badge?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export const GIconBtn: React.FC<IconBtnProps> = ({
  icon,
  dark = false,
  badge,
  onClick,
  ariaLabel,
}) => {
  const C = useG(dark);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        all: 'unset',
        cursor: onClick ? 'pointer' : 'default',
        width: 44,
        height: 44,
        borderRadius: 12,
        border: `1.2px solid ${C.borderSoft}`,
        color: C.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: C.bg,
        boxSizing: 'border-box',
      }}
    >
      {icon}
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: C.danger,
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: `2px solid ${C.bg}`,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

// Bottom Nav do garçom — V4: aba Novo abre o chooser
type NavId = 'home' | 'calls' | 'scan' | 'shift' | 'me';

interface BottomNavProps {
  active?: NavId;
  dark?: boolean;
  onNewEntry?: () => void;
  onTabChange?: (id: NavId) => void;
  callsBadge?: number;
}

export const GBottomNav: React.FC<BottomNavProps> = ({
  active = 'home',
  dark = false,
  onNewEntry = () => {},
  onTabChange,
  callsBadge = 0,
}) => {
  const C = useG(dark);
  const items: Array<{
    id: NavId;
    label: string;
    icon: (s: number) => React.ReactElement;
    badge?: number;
    action?: 'newEntry';
  }> = [
    { id: 'home', label: 'Mesas', icon: Icon.table },
    { id: 'calls', label: 'Chamados', icon: Icon.bell, badge: callsBadge || undefined },
    { id: 'scan', label: 'Novo', icon: Icon.qr, action: 'newEntry' },
    { id: 'shift', label: 'Turno', icon: Icon.history },
    { id: 'me', label: 'Eu', icon: Icon.user },
  ];
  return (
    <div
      style={{
        borderTop: `1px solid ${C.borderFaint}`,
        background: C.bg,
        display: 'flex',
        justifyContent: 'space-around',
        // P1 #20: iOS Safari home-indicator (~34px) escondia os icones.
        // env() respeita o notch · 14px e o baseline em devices sem.
        padding: '8px 4px max(env(safe-area-inset-bottom), 14px)',
      }}
    >
      {items.map((it) => {
        const isActive = it.id === active;
        const isAction = it.action === 'newEntry';
        const onClick = isAction ? onNewEntry : () => onTabChange?.(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={onClick}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              minHeight: 44,
              position: 'relative',
              color: isActive ? C.ink : C.faint,
            }}
          >
            <div style={{ position: 'relative' }}>
              {it.icon(22)}
              {it.badge !== undefined && it.badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: C.danger,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}
                >
                  {it.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, letterSpacing: 0.2 }}>
              {it.label}
            </span>
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 28,
                  height: 2,
                  borderRadius: 1,
                  background: C.ink,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

// Bottom Nav da recepcionista (host)
type HostNavId = 'tables' | 'waitlist' | 'reserva' | 'inbox' | 'me';

interface HostBottomNavProps {
  active?: HostNavId;
  dark?: boolean;
  onTabChange?: (id: HostNavId) => void;
  waitlistBadge?: number;
  reservaBadge?: number;
  inboxBadge?: number;
}

export const HBottomNav: React.FC<HostBottomNavProps> = ({
  active = 'tables',
  dark = false,
  onTabChange,
  waitlistBadge = 0,
  reservaBadge = 0,
  inboxBadge = 0,
}) => {
  const C = useG(dark);
  const items: Array<{
    id: HostNavId;
    label: string;
    icon: (s: number) => React.ReactElement;
    badge?: number;
  }> = [
    { id: 'tables', label: 'Mesas', icon: Icon.table },
    { id: 'waitlist', label: 'Espera', icon: Icon.list, badge: waitlistBadge || undefined },
    { id: 'reserva', label: 'Reservas', icon: Icon.clock, badge: reservaBadge || undefined },
    { id: 'inbox', label: 'Avisos', icon: Icon.bell, badge: inboxBadge || undefined },
    { id: 'me', label: 'Eu', icon: Icon.user },
  ];
  return (
    <div
      style={{
        borderTop: `1px solid ${C.borderFaint}`,
        background: C.bg,
        display: 'flex',
        justifyContent: 'space-around',
        // P1 #20: iOS Safari home-indicator (~34px) escondia os icones.
        // env() respeita o notch · 14px e o baseline em devices sem.
        padding: '8px 4px max(env(safe-area-inset-bottom), 14px)',
      }}
    >
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onTabChange?.(it.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              minHeight: 44,
              position: 'relative',
              color: isActive ? C.ink : C.faint,
            }}
          >
            <div style={{ position: 'relative' }}>
              {it.icon(22)}
              {it.badge !== undefined && it.badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: C.danger,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}
                >
                  {it.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, letterSpacing: 0.2 }}>
              {it.label}
            </span>
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 28,
                  height: 2,
                  borderRadius: 1,
                  background: C.ink,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
