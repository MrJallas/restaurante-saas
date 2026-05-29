'use client';

import { useEffect } from 'react';
import { Split, Utensils } from 'lucide-react';
import type { CommandMode } from '../../providers/SessionProvider';
import { PillButton } from './PillButton';
import { animationClass, useReducedMotion } from '../../lib/animations';

interface TableMergeCommandSheetProps {
  open: boolean;
  onChoose: (mode: CommandMode) => void;
  onClose: () => void;
}

export function TableMergeCommandSheet({
  open,
  onChoose,
  onClose,
}: TableMergeCommandSheetProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const animClass = reducedMotion ? '' : animationClass.slideUpOverlay;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escolher comandas apos juntar mesas"
      className="fixed inset-0 z-[60] flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label="Fechar escolha de comandas"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div
        className={`relative rounded-t-[22px] bg-bg px-6 pb-safe pt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.18)] ${animClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-soft" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border-soft bg-bg text-ink hover:bg-surface"
        >
          ×
        </button>

        <div className="pb-5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-faint">
            Mesas juntadas
          </div>
          <h2 className="mt-2 text-[21px] font-bold leading-[1.18] tracking-[-0.015em] text-ink">
            Como ficam as comandas?
          </h2>
          <p className="mt-2 max-w-[320px] text-[14px] font-medium leading-[1.45] tracking-[-0.005em] text-mute">
            Essa escolha vale para os próximos pedidos feitos neste aparelho.
          </p>

          <div className="mt-5 grid gap-2.5">
            <button
              type="button"
              onClick={() => onChoose('table')}
              className="flex w-full items-center gap-3 rounded-[14px] border-[1.4px] border-ink bg-ink px-4 py-3.5 text-left text-white active:opacity-90"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/70">
                <Utensils size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold tracking-[-0.008em]">
                  Juntar comandas
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-white/75">
                  Próximos itens entram na comanda da mesa.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChoose('individual')}
              className="flex w-full items-center gap-3 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-left active:bg-bg"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink text-ink">
                <Split size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold tracking-[-0.008em] text-ink">
                  Continuar separadas
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-mute">
                  Próximos itens ficam na sua comanda.
                </span>
              </span>
            </button>
          </div>

          <PillButton variant="outline" fullWidth onClick={onClose} className="mt-4">
            Decidir depois
          </PillButton>
        </div>
      </div>
    </div>
  );
}
