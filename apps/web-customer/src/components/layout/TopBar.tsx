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
    // Respeita a notch/Dynamic Island do iPhone com baseline de 8px —
    // sem isso o titulo fica encostado na borda em iPhone e em Android
    // o header parece sem padding superior. `pt-safe` da globals.css
    // sozinho daria 0 em browsers sem safe-area; o calc com max garante
    // pelo menos 8px sempre.
    <header
      className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b-[0.5px] border-border-soft bg-bg px-[22px] pb-3.5"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
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
