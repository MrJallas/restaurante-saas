// Tokens monocromaticos exatamente como definido no handoff. Inline
// styles ao inves de Tailwind pq as TVs sao rotas standalone (1920x1080,
// sem chrome do app) e o handoff usa cores/sizes especificos que
// poluiriam o config do Tailwind se vazassem pra o resto.
export const C = {
  bg: '#ffffff',
  ink: '#0a0a0a',
  border: '#0a0a0a',
  borderSoft: '#e5e5e5',
  mute: '#6b6b6b',
  faint: '#a3a3a3',
  surface: '#f6f5f2',
  danger: '#c43a3a',
  success: '#2f7d4f',
  amber: '#f0c542',
  noteBg: '#fff7d6',
  noteBorder: '#e8c84a',
  noteText: '#5a4500',
  readyBg: '#eef7f1',
  lateBg: '#fdf2f2',
} as const;

export const FONT = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

// Keyframes consumidos pelos cards. Deixados como string pra poder
// injetar via <style> tag dentro do componente (Next sem CSS-in-JS
// runtime no projeto).
export const TV_KEYFRAMES = `
  @keyframes kdsPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes kdsAlertPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(196,58,58,0.6); }
    50%   { box-shadow: 0 0 0 6px rgba(196,58,58,0); }
  }
  @keyframes kdsBlink { 50% { opacity: 0.4; } }

  .kds-counter-secondary { display: contents; }
  .kds-counter-totals { display: contents; }

  @media (max-width: 1366px) {
    .kds-grid[data-max-cols] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 1024px) {
    .kds-grid[data-max-cols] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .kds-header { padding: 10px 16px !important; min-height: 64px !important; }
    .kds-counter-secondary { display: none !important; }
  }
  @media (max-width: 768px) {
    .kds-grid[data-max-cols] { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 480px) {
    .kds-header { padding: 8px 12px !important; min-height: 56px !important; }
    .kds-counter-totals { display: none !important; }
  }
`;
