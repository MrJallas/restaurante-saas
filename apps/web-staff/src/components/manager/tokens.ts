// Manager-side design tokens.
// Mirrors docs/design/canvas/handoff/garcom/garcom-tokens.jsx — same visual
// language as the customer/host apps (white + ink borders + Inter). Light/dark
// resolved via the `dark` flag on each component.

export interface Tokens {
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

export const G_LIGHT: Tokens = {
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

export const G_DARK: Tokens = {
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
export const MONO_FONT = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";

export const useG = (dark: boolean): Tokens => (dark ? G_DARK : G_LIGHT);
