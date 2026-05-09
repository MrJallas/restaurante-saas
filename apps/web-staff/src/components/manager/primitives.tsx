'use client';

// Atomic primitives shared by every manager screen. Faithful port of
// garcom-screens-c.jsx primitives section (MTopBar, MTab, MStat, MSection,
// MAvatar, MPill, MBottomNav, MAppHeader, GIconBtn).
//
// Mobile-first; all interactive elements have aria-label/role.

import type { CSSProperties, ReactNode, MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';

// ─── preserveQuery — anexa a query string atual da rota ao destino ─
// MBottomNav navega entre /manager, /manager/operacoes, /manager/configuracoes
// etc. Sem isso, ao pular pra Eu/Configurações, o `?name=Erica%20Gerente`
// que o login setou se perde e o profile cai no fallback "Renata
// Albuquerque". Whitelist de keys pra não vazar params irrelevantes.
const PRESERVED_QUERY_KEYS = new Set(['name', 'staffId', 'role', 'managerId']);
function appendPreservedQuery(to: string, current: URLSearchParams | null): string {
  if (!current) return to;
  const next = new URLSearchParams();
  for (const [k, v] of current.entries()) {
    if (PRESERVED_QUERY_KEYS.has(k)) next.set(k, v);
  }
  const qs = next.toString();
  if (!qs) return to;
  return to.includes('?') ? `${to}&${qs}` : `${to}?${qs}`;
}

// ─── GIconBtn — circular icon button used in topbars ──────────────
export function GIconBtn({
  icon,
  badge,
  onClick,
  ariaLabel,
  dark,
}: {
  icon: ReactNode;
  badge?: string | number;
  onClick?: () => void;
  ariaLabel?: string;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? 'Ação'}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: 32,
        height: 32,
        borderRadius: 10,
        background: C.bg,
        border: `1px solid ${C.borderSoft}`,
        color: C.ink,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {icon}
      {badge != null && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: '#C43A3A',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── GButton — primary/ghost full-width CTA ───────────────────────
export function GButton({
  children,
  kind = 'primary',
  full = false,
  onClick,
  disabled,
  dark,
  ariaLabel,
}: {
  children: ReactNode;
  kind?: 'primary' | 'ghost';
  full?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dark?: boolean;
  ariaLabel?: string;
}) {
  const C = useG(!!dark);
  const isPrimary = kind === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        width: full ? '100%' : undefined,
        flex: full ? 1 : undefined,
        textAlign: 'center',
        padding: '13px 16px',
        borderRadius: 12,
        background: disabled ? C.borderSoft : isPrimary ? C.ink : 'transparent',
        color: disabled ? C.faint : isPrimary ? C.bg : C.ink,
        border: isPrimary ? 'none' : `1.5px solid ${C.borderSoft}`,
        fontSize: 14,
        fontWeight: isPrimary ? 800 : 700,
        letterSpacing: -0.1,
        fontFamily: G_FONT,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

// ─── MTopBar — sticky topbar with optional left/right action ──────
export function MTopBar({
  title,
  left,
  right,
  dark,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surface,
        position: 'sticky',
        top: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: G_FONT,
      }}
    >
      {left ?? <div style={{ width: 32 }} />}
      <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
        {title}
      </h1>
      {right ?? <div style={{ width: 32 }} />}
    </div>
  );
}

// ─── MTab — inline horizontal tab w/ optional count badge ─────────
export function MTab({
  active,
  children,
  onClick,
  dark,
  count,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
  count?: number;
}) {
  const C = useG(!!dark);
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        flex: 1,
        textAlign: 'center',
        padding: '11px 6px',
        fontSize: 13,
        fontWeight: 600,
        color: active ? C.ink : C.faint,
        borderBottom: `2px solid ${active ? C.ink : 'transparent'}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {children}
      {count != null && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: 100,
            background: active ? C.ink : C.borderSoft,
            color: active ? C.bg : C.faint,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── MAvatar — initials chip ──────────────────────────────────────
export function MAvatar({
  name,
  init,
  color,
  size = 38,
}: {
  name?: string;
  init?: string;
  color?: string;
  size?: number;
}) {
  const initials = init ?? (name ? name.split(' ').map((p) => p[0]).slice(0, 2).join('') : '');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color ?? '#777',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: G_FONT,
        letterSpacing: -0.2,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

// ─── MPill — tinted oval badge ───────────────────────────────────
export type PillTone = 'success' | 'warn' | 'danger' | 'info' | 'mute';

export function MPill({
  tone = 'mute',
  children,
  dark,
  dot,
}: {
  tone?: PillTone;
  children: ReactNode;
  dark?: boolean;
  dot?: boolean;
}) {
  const C = useG(!!dark);
  const map = {
    success: { bg: '#E5F2EA', fg: '#0F5A37', dot: '#1E8C5A' },
    warn: { bg: '#FFF3E0', fg: '#7A4D10', dot: '#D98E2B' },
    danger: { bg: '#FFE6E6', fg: '#A12626', dot: '#C43A3A' },
    info: { bg: '#EFF3FA', fg: '#1F3784', dot: '#3B5FBE' },
    mute: { bg: C.surface, fg: C.faint, dot: C.faint },
  } as const;
  const t = map[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 100,
        background: t.bg,
        color: t.fg,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.dot }} />}
      {children}
    </span>
  );
}

// ─── MStat — KPI tile, supports `compact` variant w/ help button ─
export function MStat({
  label,
  value,
  sub,
  subColor,
  trend,
  help,
  dark,
  accent,
  compact = false,
  onHelp,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  subColor?: string;
  trend?: { dir: 'up' | 'down' | 'flat' };
  help?: string;
  dark?: boolean;
  accent?: string | null;
  compact?: boolean;
  onHelp?: () => void;
}) {
  const C = useG(!!dark);
  const trendColor = trend?.dir === 'up' ? '#1E8C5A' : trend?.dir === 'down' ? '#C43A3A' : C.faint;
  const subFinal = subColor ?? (trend ? trendColor : C.faint);
  return (
    <div
      style={{
        padding: compact ? 12 : 14,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        background: C.bg,
        flex: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: compact ? 10.5 : 11,
          color: C.faint,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: compact ? 0.6 : 0.4,
          fontFamily: compact ? MONO_FONT : undefined,
          paddingRight: compact && help ? 18 : 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: compact ? 22 : 24,
          fontWeight: 800,
          color: accent ?? C.ink,
          marginTop: compact ? 2 : 4,
          letterSpacing: -0.5,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {(sub || trend) && (
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: subFinal,
            marginTop: compact ? 3 : 4,
            fontWeight: subColor ? 700 : 600,
            textTransform: compact ? 'uppercase' : 'none',
            letterSpacing: compact ? 0.6 : 0,
            fontFamily: compact ? MONO_FONT : undefined,
          }}
        >
          {trend && (trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '·')} {sub}
        </div>
      )}
      {help && !compact && (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
          {help}
        </div>
      )}
      {help && compact &&
        (onHelp ? (
          <button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onHelp();
            }}
            title={help}
            aria-label={`Detalhes sobre ${label}`}
            style={{
              position: 'absolute',
              top: 7,
              right: 7,
              width: 22,
              height: 22,
              borderRadius: 11,
              border: `1px solid ${C.borderSoft}`,
              color: C.faint,
              background: 'transparent',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ?
          </button>
        ) : (
          <div
            title={help}
            aria-label={`Sobre ${label}: ${help}`}
            style={{
              position: 'absolute',
              top: 9,
              right: 9,
              width: 16,
              height: 16,
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              color: C.faint,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'help',
            }}
          >
            ?
          </div>
        ))}
    </div>
  );
}

// ─── MSection — labeled vertical section w/ optional action ──────
export function MSection({
  title,
  action,
  onAction,
  children,
  dark,
  sub,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  dark?: boolean;
  sub?: string;
  style?: CSSProperties;
}) {
  const C = useG(!!dark);
  return (
    <section style={{ marginTop: 18, ...style }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '0 16px 8px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {title}
          </div>
          {sub && (
            <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 500, marginTop: 2 }}>{sub}</div>
          )}
        </div>
        {action &&
          (onAction ? (
            <button
              onClick={onAction}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 12,
                color: C.ink,
                fontWeight: 700,
                letterSpacing: -0.1,
              }}
            >
              {action}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{action}</div>
          ))}
      </div>
      {children}
    </section>
  );
}

// ─── MBottomNav — manager bottom navigation (5 abas) ─────────────
export type ManagerNavId = 'home' | 'ops' | 'staff' | 'finance' | 'me';

export function MBottomNav({
  active = 'home',
  dark,
  onTo,
  alerts = 0,
}: {
  active?: ManagerNavId;
  dark?: boolean;
  onTo?: (route: string) => void;
  alerts?: number;
}) {
  const C = useG(!!dark);
  // Lê a query atual pra preservar `?name=…` ao pular entre abas.
  // useSearchParams retorna null durante o SSR; appendPreservedQuery
  // tolera null devolvendo o destino sem alteração.
  const searchParams = useSearchParams();
  const items: { id: ManagerNavId; label: string; icon: (s?: number) => ReactNode; to: string; badge?: number }[] = [
    { id: 'home', label: 'Painel', icon: Icon.list, to: appendPreservedQuery('/manager', searchParams) },
    { id: 'ops', label: 'Operação', icon: Icon.flame, to: appendPreservedQuery('/manager/operacoes', searchParams), badge: alerts > 0 ? alerts : undefined },
    { id: 'staff', label: 'Equipe', icon: Icon.user, to: appendPreservedQuery('/manager/equipe', searchParams) },
    { id: 'finance', label: 'Financeiro', icon: Icon.receipt, to: appendPreservedQuery('/manager/financeiro', searchParams) },
    { id: 'me', label: 'Eu', icon: Icon.settings, to: appendPreservedQuery('/manager/configuracoes', searchParams) },
  ];
  return (
    <nav
      aria-label="Navegação principal"
      style={{
        borderTop: `1px solid ${C.borderFaint}`,
        background: C.bg,
        display: 'flex',
        justifyContent: 'space-around',
        // P1 #20: iOS Safari tem `safe-area-inset-bottom` >= 34px no
        // home-indicator. Sem env(), o nav ficava embaixo da home bar e
        // o usuario nao via os icones. `max(env, 14px)` mantem o
        // baseline em devices sem notch.
        padding: '8px 4px max(env(safe-area-inset-bottom), 14px)',
        position: 'sticky',
        bottom: 0,
        zIndex: 4,
      }}
    >
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => onTo?.(it.to)}
            aria-label={it.label}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              position: 'relative',
              color: isActive ? C.ink : C.faint,
            }}
          >
            <span style={{ position: 'relative' }}>
              {it.icon(22)}
              {it.badge != null && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: '#C43A3A',
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
            </span>
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
    </nav>
  );
}

// ─── MAppHeader — top-level greeting + AO VIVO + bell ────────────
export function MAppHeader({
  dark,
  title,
  bellBadge = 0,
  greetingName = 'Renata Albuquerque',
  greeting = 'Boa noite,',
  live = 'AO VIVO · TURNO DA NOITE',
  onBell,
}: {
  dark?: boolean;
  title: string;
  bellBadge?: number;
  greetingName?: string;
  greeting?: string;
  live?: string | null;
  onBell?: () => void;
}) {
  const C = useG(!!dark);
  return (
    <>
      <MTopBar
        dark={dark}
        title={title}
        right={
          <GIconBtn
            dark={dark}
            icon={Icon.bell(20)}
            badge={bellBadge > 0 ? bellBadge : undefined}
            onClick={onBell}
            ariaLabel="Notificações"
          />
        }
      />
      <div style={{ padding: '4px 16px 14px' }}>
        <div style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>{greeting}</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: C.ink, marginTop: 2 }}>
          {greetingName}
        </div>
      </div>
      {live && (
        <div style={{ padding: '0 16px 4px' }}>
          <div
            style={{
              display: 'inline-flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#1E8C5A',
              }}
            />
            {live}
          </div>
        </div>
      )}
    </>
  );
}
