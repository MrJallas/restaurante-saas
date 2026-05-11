// Tokens compartilhados (garcom-tokens.jsx port)
// Mesma linguagem visual do KDS · branco + bordas pretas + Inter
// Suporta tema claro/escuro

export interface GTokens {
  bg: string;
  surface: string;
  ink: string;
  border: string;
  borderSoft: string;
  borderFaint: string;
  mute: string;
  faint: string;
  danger: string;
  dangerBg: string;
  warn: string;
  warnBg: string;
  success: string;
  successBg: string;
  info: string;
  infoBg: string;
}

export const G_LIGHT: GTokens = {
  bg: '#ffffff',
  surface: '#f6f5f2',
  ink: '#0a0a0a',
  border: '#0a0a0a',
  borderSoft: '#e5e5e5',
  borderFaint: '#efefef',
  mute: '#6b6b6b',
  faint: '#a3a3a3',
  danger: '#c43a3a',
  dangerBg: '#fdecec',
  warn: '#b87800',
  warnBg: '#fdf3d8',
  success: '#2f7d4f',
  successBg: '#e8f3ec',
  info: '#1a4f8a',
  infoBg: '#e7eef8',
};

export const G_DARK: GTokens = {
  bg: '#0b0b0e',
  surface: '#15151a',
  ink: '#f4f4f4',
  border: '#f4f4f4',
  borderSoft: '#2a2a30',
  borderFaint: '#1d1d22',
  mute: '#8e8e94',
  faint: '#5a5a60',
  danger: '#e85a5a',
  dangerBg: '#3a1818',
  warn: '#e0a83b',
  warnBg: '#3a2c10',
  success: '#5cb47e',
  successBg: '#13301f',
  info: '#5b8fc9',
  infoBg: '#152538',
};

export const G_FONT = "'Inter', system-ui, -apple-system, sans-serif";
// Round 18 (Onda 3): MONO_FONT exposto pra waiter screens novas
// (TableDetail/CallDetail/WaiterCalls) que usam eyebrow uppercase.
export const MONO_FONT = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";

export const useG = (dark: boolean): GTokens => (dark ? G_DARK : G_LIGHT);

// Status colors for host views (HSt mirror)
export const HSt = {
  livre: {
    bg: '#fff', bd: '#e5e5e5', fg: '#0a0a0a', dot: '#a3a3a3',
    label: 'Livre', dashed: true, pulse: false,
  },
  liberada: {
    bg: '#FFF7E8', bd: '#F0DCB6', fg: '#7a4d10', dot: '#D98E2B',
    label: 'Liberada', dashed: false, pulse: true,
  },
  ocupada: {
    bg: '#fff', bd: '#0a0a0a', fg: '#0a0a0a', dot: '#1E8C5A',
    label: 'Ocupada', dashed: false, pulse: false,
  },
  alerta: {
    bg: '#FFF1F1', bd: '#C43A3A', fg: '#A12626', dot: '#C43A3A',
    label: 'Atenção', dashed: false, pulse: true,
  },
} as const;

export type HostTableStatus = keyof typeof HSt;
