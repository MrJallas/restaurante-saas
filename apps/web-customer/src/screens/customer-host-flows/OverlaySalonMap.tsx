'use client';

import { useMemo } from 'react';

interface SalonMapTable {
  /** Table number shown in the cell. */
  number: number;
  /** First name of the host (for the hint label). null = unoccupied. */
  hostName?: string | null;
  /** Party size, used in the hint label. */
  partySize?: number;
  /** When true, the cell is dimmed (out-of-range or empty). */
  disabled?: boolean;
}

interface OverlaySalonMapProps {
  /** The customer's own table — pinned with "VOCÊ TÁ AQUI" badge. */
  yourTable: number;
  /** Currently selected target. */
  selectedTable?: number | null;
  /** Tables to render in the 3×3 grid (or 2×3 / 3×4 — caller decides). */
  tables?: SalonMapTable[];
  /** Triggered when the customer taps a table cell. */
  onSelect?: (tableNumber: number) => void;
  /** Triggered when the customer hits the bottom CTA. */
  onConfirm?: (tableNumber: number) => void;
  /** Triggered when the customer dismisses the overlay (X icon). */
  onClose?: () => void;
}

/**
 * `OverlaySalonMap` · per docs/features/customer-host-model.md (frames 01-02
 * of cliente-table-merge.jsx).
 *
 * Mini-map of the salon used to pick a target table for a merge request.
 * This is C1's primitive — once they ship it under
 * `apps/web-customer/src/components/host/OverlaySalonMap.tsx` we'll re-export
 * from there. For now this is the local placeholder that lets C2's screens
 * compile and ship without blocking on C1.
 *
 * Behaviors:
 *  - your table pinned center · ink-on-ink · "VOCÊ TÁ AQUI"
 *  - adjacent tables show host hint when occupied
 *  - selected target gets a 2 px ink ring + check
 *  - CTA disabled until something is selected
 */
export function OverlaySalonMap({
  yourTable,
  selectedTable = null,
  tables,
  onSelect,
  onConfirm,
  onClose,
}: OverlaySalonMapProps) {
  // Default 3×3 layout when caller hasn't supplied one. Real implementation
  // by C1 will pull from /salon/grid endpoint.
  const grid = useMemo<SalonMapTable[]>(() => {
    if (tables && tables.length > 0) return tables;
    return [
      { number: yourTable - 3, disabled: true },
      { number: yourTable - 2, hostName: 'Casal Santos', partySize: 2 },
      { number: yourTable - 1, disabled: true },
      { number: yourTable - 0.5, disabled: true }, // filler
      { number: yourTable }, // self
      { number: yourTable + 1, hostName: 'Família Lopes', partySize: 3 },
      { number: yourTable + 2, disabled: true },
      { number: yourTable + 3, hostName: 'Casal Reis', partySize: 2 },
      { number: yourTable + 4, disabled: true },
    ].filter((t) => Number.isInteger(t.number)) as SalonMapTable[];
  }, [tables, yourTable]);

  return (
    <div
      role="dialog"
      aria-label="Mapa do salão"
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'rgba(0,0,0,0.32)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="mt-auto rounded-t-[22px] bg-bg p-5 pt-6">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
          Salão · escolha a mesa pra juntar
        </p>
        <h2 className="mb-4 text-[20px] font-bold tracking-[-0.4px] text-ink">
          Com qual mesa você quer juntar?
        </h2>

        <div className="grid grid-cols-3 gap-2.5">
          {grid.map((t) => {
            const isYou = t.number === yourTable;
            const isSelected = !isYou && selectedTable === t.number;
            const isDisabled = !isYou && (t.disabled || !t.hostName);
            return (
              <button
                key={t.number}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onSelect?.(t.number)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-[12px] border p-2 text-center transition-colors ${
                  isYou
                    ? 'border-ink bg-ink text-white'
                    : isSelected
                      ? 'border-[2px] border-ink bg-white text-ink'
                      : isDisabled
                        ? 'border-border-soft bg-surface text-faint opacity-50'
                        : 'border-border-soft bg-white text-ink'
                }`}
              >
                <span className="text-[18px] font-bold tracking-[-0.4px]">
                  {Math.round(t.number)}
                </span>
                {isYou && (
                  <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[1px] text-white/80">
                    Você
                  </span>
                )}
                {!isYou && t.hostName && (
                  <span className="mt-0.5 line-clamp-1 text-[9px] font-medium leading-[1.2] text-mute">
                    {t.hostName}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={selectedTable == null}
          onClick={() => selectedTable != null && onConfirm?.(selectedTable)}
          className="mt-5 w-full rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {selectedTable != null
            ? `Pedir pra juntar com mesa ${selectedTable}`
            : 'Selecione uma mesa'}
        </button>
      </div>
    </div>
  );
}
