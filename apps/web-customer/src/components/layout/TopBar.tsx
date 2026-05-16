'use client';

import { useUIState } from '../../providers/UIStateProvider';

interface TopBarProps {
  restaurantName: string;
  tableLabel: string;
  onBack?: () => void;
  showHamburger?: boolean;
}

export function TopBar({
  restaurantName,
  tableLabel,
  onBack,
  showHamburger = true,
}: TopBarProps) {
  const { openDrawer } = useUIState();
  return (
    // Padding superior maior pra que botoes "Voltar"/menu fiquem ABAIXO
    // do Dynamic Island do iPhone. O bug-hunter encontrou em iPhone 16
    // (Dynamic Island ~59pt) que o botao Voltar caia exatamente sob a
    // ilha — usuario tocava em y=44 (instinto) e o tap ia pro hardware,
    // nao pra UI. max(safe-area-inset-top, 12px) + extra 8px de margem
    // visual garantem que o centro do touch target fica abaixo da ilha
    // em qualquer iPhone moderno.
    <header
      className="sticky top-0 z-40 flex shrink-0 items-center justify-between border-b-[0.5px] border-border-soft bg-bg px-[22px] pb-3.5 pt-2"
      style={{ paddingTop: 'calc(max(env(safe-area-inset-top), 12px) + 8px)' }}
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="flex h-9 w-9 items-center justify-center rounded-full border-[1.2px] border-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M9 2 3 7l6 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div>
          <div className="text-[14px] font-semibold tracking-[-0.012em]">
            {restaurantName}
          </div>
          <div className="mt-[1px] text-[11px] tracking-[0.5px] text-mute">
            {tableLabel}
          </div>
        </div>
      </div>
      {showHamburger && (
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-full border-[1.2px] border-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </header>
  );
}
