import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        ink: 'var(--color-ink)',
        border: 'var(--color-border)',
        'border-soft': 'var(--color-border-soft)',
        mute: 'var(--color-mute)',
        faint: 'var(--color-faint)',
        surface: 'var(--color-surface)',
        danger: 'var(--color-danger)',
        'danger-wash': 'var(--color-danger-wash)',
        success: 'var(--color-success)',
        'success-wash': 'var(--color-success-wash)',
        warning: 'var(--color-warning)',
        'warning-wash': 'var(--color-warning-wash)',
        accent: 'var(--color-accent)',
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      fontFamily: {
        hero: ['var(--font-hero)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      boxShadow: {
        pill: '0 2px 8px rgba(10, 10, 10, 0.08)',
        glass: '0 8px 28px rgba(10, 10, 10, 0.08)',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 300ms ease-out both',
        fadeOut: 'fadeOut 250ms ease-in both',
      },
      transitionTimingFunction: {
        // Curva oficial do canvas para morph chip→input (Apple Music card)
        'liquid': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
