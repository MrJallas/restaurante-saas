'use client';

// "Agir agora" 2-card row used in Painel + Operação. Each card is a chunky
// stacked button (icon · label · sub) reaching to the bottom-nav bar.
//
// Pause card supports a live countdown — when pauseActive.remaining is set,
// the sub-label flips to mono "MM:SS restantes" and a pulsing dot appears in
// the corner. This is what guarantees the manager sees "pausa rodando" even
// without scrolling to "Em curso".

import { useG, MONO_FONT } from './tokens';
import { Icon } from './Icons';

export type QuickActionId = 'reorder' | 'pause' | 'message';

export interface MQuickActionsBarProps {
  dark?: boolean;
  onTo?: (route: string) => void;
  variant?: 'stacked' | 'inline';
  pauseActive?: { remaining: number } | null;
  /** Slim mode: 2 cards used by the Painel header. */
  slim?: boolean;
}

const TOOLS: ReadonlyArray<{
  id: QuickActionId;
  label: string;
  sub: string;
  to: string;
  tint: string;
  tintBg: string;
  iconKey: 'flame' | 'pause' | 'chat';
}> = [
  { id: 'pause', label: 'Pausar Zona', sub: 'Pausa de 1 garçom', to: '/manager/pausa-zona', tint: '#9A7212', tintBg: '#FFF7E6', iconKey: 'pause' },
  { id: 'message', label: 'Mensagem Equipe', sub: 'Mandar pra alguém', to: '/manager/mensagens', tint: '#1F3784', tintBg: '#EFF3FA', iconKey: 'chat' },
];

const TOOLS_FULL: ReadonlyArray<{
  id: QuickActionId;
  label: string;
  sub: string;
  to: string;
  tint: string;
  tintBg: string;
  iconKey: 'flame' | 'pause' | 'chat';
}> = [
  { id: 'reorder', label: 'Cozinha', sub: 'Reordenar fila', to: '/manager/cozinha-reorder', tint: '#C2401A', tintBg: '#FFF1EC', iconKey: 'flame' },
  { id: 'pause', label: 'Pausa', sub: 'Pedidos novos', to: '/manager/pausa-zona', tint: '#9A7212', tintBg: '#FFF7E6', iconKey: 'pause' },
];

const ICONS = { flame: Icon.flame, pause: Icon.pause, chat: Icon.chat } as const;

export function MQuickActionsBar({
  dark,
  onTo,
  variant = 'stacked',
  pauseActive,
  slim = false,
}: MQuickActionsBarProps) {
  const C = useG(!!dark);
  const tools = slim ? TOOLS : TOOLS_FULL;

  let pauseCountdown: string | null = null;
  if (pauseActive && typeof pauseActive.remaining === 'number') {
    const r = Math.max(0, pauseActive.remaining);
    pauseCountdown = `${Math.floor(r / 60).toString().padStart(2, '0')}:${(r % 60).toString().padStart(2, '0')}`;
  }

  return (
    <div
      style={{
        padding: '8px 16px 10px',
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.bg,
      }}
      role="toolbar"
      aria-label="Ferramentas rápidas"
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: C.faint,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
          marginBottom: 6,
          fontFamily: MONO_FONT,
        }}
      >
        Agir agora
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {tools.map((t) => {
          const showPauseState = t.id === 'pause' && pauseCountdown != null;
          const sub = showPauseState ? `${pauseCountdown} restantes` : t.sub;
          const Ico = ICONS[t.iconKey];
          return (
            <button
              key={t.id}
              onClick={() => onTo?.(t.to)}
              title={variant === 'inline' ? `${t.label} · ${sub}` : undefined}
              aria-label={`${t.label} · ${sub}`}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                flex: 1,
                height: 56,
                padding: '0 12px',
                border: `1px solid ${showPauseState ? '#F0DCB6' : C.borderSoft}`,
                borderRadius: 12,
                background: showPauseState ? '#FFF7E6' : C.surface,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                position: 'relative',
              }}
            >
              {showPauseState && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#9A7212',
                  }}
                />
              )}
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: t.tintBg,
                  color: t.tint,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {Ico(16)}
              </span>
              {variant === 'inline' ? (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14,
                    fontWeight: 800,
                    color: C.ink,
                    letterSpacing: -0.1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.label}
                </span>
              ) : (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, letterSpacing: -0.1, lineHeight: 1.1 }}>
                    {t.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: showPauseState ? '#7A4D10' : C.faint,
                      fontWeight: showPauseState ? 700 : 500,
                      lineHeight: 1.2,
                      marginTop: 1,
                      fontVariantNumeric: showPauseState ? 'tabular-nums' : 'normal',
                      fontFamily: showPauseState ? MONO_FONT : undefined,
                      letterSpacing: showPauseState ? 0.2 : 0,
                    }}
                  >
                    {sub}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
