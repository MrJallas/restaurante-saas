'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Contextual chip rendered below assistant messages. Pill outline / filled.
 *
 * STUB: this is C1's primitive — replace with the real `ContextualChip` when
 * it lands. Visual matches `ContextualChip` in `cliente-tokens.jsx` (V20):
 *   - outline (default) · 1.2px borderSoft · bg #fff · text ink
 *   - primary           · ink fill · white text · 1.2px ink border
 *   - destructive       · same as primary visually (brick-tinted in V14
 *                         canvas; we stay monochrome here per design system)
 */
type Variant = 'outline' | 'primary' | 'destructive';

interface SuggestionChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  children: ReactNode;
}

export function SuggestionChip({
  variant = 'outline',
  className = '',
  children,
  ...rest
}: SuggestionChipProps) {
  const base =
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium tracking-[-0.005em] transition-colors duration-100 disabled:opacity-50';
  const variants: Record<Variant, string> = {
    outline: 'border-[1.2px] border-border-soft bg-bg text-ink active:bg-surface',
    primary: 'border-[1.2px] border-ink bg-ink text-white active:opacity-90',
    destructive:
      'border-[1.2px] border-danger bg-bg text-danger active:bg-[#fbe9e7]',
  };
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
