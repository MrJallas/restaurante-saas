'use client';

// Lockscreen notification card — base component shared by the 9 variants.
// Renders an iOS-style glass-blur card. For Android we accept `expanded`
// + `actions` to mirror the Material You shape used in the canvas.
//
// Per docs/design-canvas/handoff/garcom/garcom-push.jsx :: IOSNotif/AndroidNotif.

import * as React from 'react';

export type PushTone = 'danger' | 'success' | 'info' | 'warn';

interface PushAction {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

export interface PushCardProps {
  tone: PushTone;
  title: string;
  body: string;
  time?: string;
  urgent?: boolean;
  /** When true, render Android-style expanded card with action buttons. */
  expanded?: boolean;
  actions?: PushAction[];
  appLabel?: string;
  appBadge?: string;
  /** Tap handler for the whole card — typically navigates to the relevant screen. */
  onTap?: () => void;
}

const TONE_TO_TINT_IOS: Record<PushTone, string> = {
  danger: '#ff453a',
  success: '#30d158',
  info: '#0a84ff',
  warn: '#ff9f0a',
};

const TONE_TO_TINT_ANDROID: Record<PushTone, string> = {
  danger: '#ff5449',
  success: '#3ddc84',
  info: '#7cb1ff',
  warn: '#f4b942',
};

/**
 * iOS-style lockscreen card with glassmorphism. Use this for the default
 * preview screens (the 9 variants).
 */
export const PushCardIOS: React.FC<PushCardProps> = ({
  tone, title, body, time, urgent, appLabel = 'TL', appBadge, onTap,
}) => {
  const tint = TONE_TO_TINT_IOS[tone];
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset', cursor: onTap ? 'pointer' : 'default', boxSizing: 'border-box',
        margin: '0 12px',
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: urgent
          ? `0 0 0 2px ${tint}d9, 0 8px 24px ${tint}40`
          : '0 1px 0 rgba(255,255,255,0.4) inset, 0 4px 16px rgba(0,0,0,0.06)',
        animation: urgent ? 'gPushPulse 1.6s infinite' : 'none',
        display: 'block', width: 'auto', maxWidth: 380,
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 12 }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 9, flexShrink: 0,
            background: '#0a0a0a', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', system-ui", fontWeight: 700, fontSize: 14,
            letterSpacing: -0.5, position: 'relative',
          }}
        >
          {appLabel}
          {(urgent || appBadge) && (
            <span
              style={{
                position: 'absolute', top: -3, right: -3,
                width: 12, height: 12, borderRadius: 6, background: tint,
                border: '2px solid rgba(255,255,255,0.9)',
              }}
            />
          )}
        </div>
        <div
          style={{
            flex: 1, minWidth: 0,
            fontFamily: '-apple-system, system-ui', color: '#000', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{title}</div>
            {time && (
              <div
                style={{
                  fontSize: 13, color: 'rgba(60,60,67,0.6)',
                  flexShrink: 0, marginLeft: 8,
                }}
              >
                {time}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 15, lineHeight: '20px', color: '#000',
              marginTop: 1, letterSpacing: -0.2,
            }}
          >
            {body}
          </div>
        </div>
      </div>
    </button>
  );
};

/**
 * Android Material You expanded variant — used in dev / Storybook to mirror
 * the canvas layout when caller wants the rich card with buttons.
 */
export const PushCardAndroid: React.FC<PushCardProps> = ({
  tone, title, body, time, urgent, expanded, actions = [], onTap,
}) => {
  const tint = TONE_TO_TINT_ANDROID[tone];
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset', cursor: onTap ? 'pointer' : 'default', boxSizing: 'border-box',
        margin: '0 8px', borderRadius: 28, overflow: 'hidden',
        background: 'rgba(46,42,52,0.78)',
        backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        boxShadow: urgent ? `0 0 0 2px ${tint}, 0 6px 18px ${tint}4d` : 'none',
        animation: urgent ? 'gPushPulse 1.6s infinite' : 'none',
        display: 'block', width: 'auto', maxWidth: 400,
      }}
    >
      <div
        style={{
          padding: '14px 16px 12px', fontFamily: 'Roboto, system-ui', color: '#fff',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div
            style={{
              width: 18, height: 18, borderRadius: 4, background: '#fff', color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Inter', system-ui", fontWeight: 700, fontSize: 9,
            }}
          >
            TL
          </div>
          <span style={{ fontSize: 12, opacity: 0.85, letterSpacing: 0.1 }}>
            Trattoria · {title}
          </span>
          {time && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 'auto' }}>{time}</span>}
        </div>
        <div style={{ fontSize: 14, lineHeight: '20px', color: 'rgba(255,255,255,0.95)' }}>
          {body}
        </div>
        {expanded && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 12, marginLeft: -8 }}>
            {actions.map((a, i) => (
              <span
                key={i}
                style={{
                  padding: '8px 14px', borderRadius: 100,
                  fontSize: 13, fontWeight: 500, letterSpacing: 0.1,
                  color: a.primary ? '#000' : tint,
                  background: a.primary ? tint : 'transparent',
                }}
              >
                {a.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};

/**
 * Default export = iOS variant (used by the 9 variants).
 */
export default PushCardIOS;
