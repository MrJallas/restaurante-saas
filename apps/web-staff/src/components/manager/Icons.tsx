// Inline SVG icons (24px, currentColor). Faithful to garcom-tokens.jsx.
// Each icon is a function `(size?: number) => ReactNode` so call sites can
// pass it as JSX directly: `{Icon.bell(20)}`.

import type { ReactNode } from 'react';

const make = (path: ReactNode, baseProps: Partial<{ strokeWidth: number; strokeLinecap: 'round' | 'butt' | 'square'; strokeLinejoin: 'round' | 'miter' | 'bevel' }> = {}) => {
  function IconSvg(s = 22): ReactNode {
    return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={baseProps.strokeWidth ?? 1.8}
      strokeLinecap={baseProps.strokeLinecap ?? 'round'}
      strokeLinejoin={baseProps.strokeLinejoin ?? 'round'}
      aria-hidden="true"
    >
      {path}
    </svg>
    );
  }
  return IconSvg;
};

export const Icon = {
  bell: make(
    <>
      <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </>,
  ),
  hand: make(
    <>
      <path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2" />
      <path d="M14 10V4a2 2 0 00-2-2 2 2 0 00-2 2v2" />
      <path d="M10 10.5V6a2 2 0 00-2-2 2 2 0 00-2 2v8" />
      <path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-1.4-5.5-2.7L2 14" />
    </>,
  ),
  receipt: make(
    <>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
      <path d="M8 7h8M8 11h8M8 15h6" />
    </>,
  ),
  trash: make(
    <>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>,
  ),
  minus: make(<path d="M5 12h14" />, { strokeWidth: 2 }),
  x: make(<path d="M6 6l12 12M18 6L6 18" />, { strokeWidth: 2 }),
  fork: make(
    <>
      <path d="M7 2v8a2 2 0 002 2h0v10" />
      <path d="M11 2v8a2 2 0 01-2 2" />
      <path d="M3 2v8" />
      <path d="M17 2c-2 0-3 2-3 5v5h3v10" />
    </>,
  ),
  glass: make(
    <>
      <path d="M5 3h14l-2 9a5 5 0 01-10 0L5 3z" />
      <path d="M12 17v4M9 21h6" />
    </>,
  ),
  table: make(
    <>
      <rect x="3" y="6" width="18" height="4" rx="1" />
      <path d="M5 10v10M19 10v10M9 14h6" />
    </>,
  ),
  clock: make(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  user: make(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </>,
  ),
  plus: make(<path d="M12 5v14M5 12h14" />, { strokeWidth: 2 }),
  check: make(<path d="M4 12l5 5L20 6" />, { strokeWidth: 2.2 }),
  arrow: make(<path d="M5 12h14M13 5l7 7-7 7" />, { strokeWidth: 2 }),
  back: make(<path d="M19 12H5M12 19l-7-7 7-7" />, { strokeWidth: 2 }),
  search: make(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>,
  ),
  list: make(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />),
  history: make(
    <>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  settings: make(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>,
  ),
  more: make(
    <>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>,
    { strokeWidth: 2 },
  ),
  flame: make(
    <path d="M12 2c0 4-4 5-4 9a4 4 0 008 0c0-2-1-3-2-4 0 2-1 3-2 3 1-3 0-7 0-8z" />,
  ),
  shield: make(<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />),
  phone: make(
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0122 16.92z" />,
  ),
  chat: make(
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  ),
  globe: make(
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z" />
    </>,
  ),
  pause: make(
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>,
  ),
  gift: make(
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9a1 1 0 001 1h12a1 1 0 001-1v-9" />
      <line x1="12" y1="22" x2="12" y2="8" />
      <path d="M12 8a3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3 3 3 0 01-3 3z" />
    </>,
  ),
  sparkle: make(
    <>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>,
  ),
  qr: make(
    <>
      <path d="M4 9V6a2 2 0 012-2h3" />
      <path d="M20 9V6a2 2 0 00-2-2h-3" />
      <path d="M4 15v3a2 2 0 002 2h3" />
      <path d="M20 15v3a2 2 0 01-2 2h-3" />
      <path d="M9 12h6" />
    </>,
  ),
  warning: make(
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>,
  ),
  shieldOff: make(
    <>
      <path d="M19.69 14a6.9 6.9 0 00.31-2V5l-8-3-3.16 1.18" />
      <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 005.62-4.38" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>,
  ),
};

export type IconName = keyof typeof Icon;
