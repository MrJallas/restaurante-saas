'use client';

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

type Variant = 'outline' | 'filled';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  fullWidth?: boolean;
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  function PillButton(
    { variant = 'outline', className = '', children, fullWidth, ...rest },
    ref,
  ) {
    // `active:scale-[0.98]` da o feedback tatil que substitui o brilho do glass;
    // `duration-100` + `transition-transform` mantem a animacao barata (compositor,
    // sem layout). Combinado com `transition-colors` pra o hover/active de bg.
    const base =
      'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-medium tracking-[-0.01em] transition-[colors,transform] duration-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';
    const variants: Record<Variant, string> = {
      outline:
        'bg-bg text-ink border-[1.3px] border-ink hover:bg-surface active:bg-[#ededea]',
      filled:
        'bg-ink text-white border-[1.3px] border-ink hover:bg-black active:opacity-90',
    };
    const width = fullWidth ? 'w-full' : '';
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${width} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
