'use client';

import { C } from './styles';

interface KdsCounterProps {
  label: string;
  n: number;
  active?: boolean;
  dot?: string;
  alert?: boolean;
}

export function KdsCounter({ label, n, active, dot, alert }: KdsCounterProps) {
  return (
    <div
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        background: active ? '#fff' : 'transparent',
        color: active ? C.ink : '#fff',
        border: `1.3px solid ${active ? '#fff' : 'rgba(255,255,255,0.25)'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: alert && n > 0 ? 'kdsAlertPulse 1.6s infinite' : 'none',
      }}
    >
      {dot && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: dot,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.5,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </span>
    </div>
  );
}
