'use client';

import { useMemo, useState } from 'react';
import { PillButton } from '../ui/PillButton';

export interface DrinkSize {
  label: string;
  priceCents: number;
}

export interface DrinkPreference {
  id: string;
  label: string;
  defaultSelected?: boolean;
}

export interface DrinkDetailData {
  id: string;
  name: string;
  priceCents: number;
  description?: string;
  tags?: string[];
  sizes?: DrinkSize[];
  preferences?: DrinkPreference[];
}

interface DrinkDetailProps {
  drink: DrinkDetailData;
  onBack: () => void;
  onAdd: (data: {
    size?: string;
    preferences: string[];
    quantity: number;
    priceCents: number;
  }) => void;
  isAdding?: boolean;
}

export function DrinkDetail({ drink, onBack, onAdd, isAdding }: DrinkDetailProps) {
  const [sizeIndex, setSizeIndex] = useState(0);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    () =>
      (drink.preferences ?? []).reduce<Record<string, boolean>>((acc, p) => {
        acc[p.id] = Boolean(p.defaultSelected);
        return acc;
      }, {}),
  );
  const [quantity, setQuantity] = useState(1);

  const chosenSize = drink.sizes?.[sizeIndex];
  const unitPrice = chosenSize?.priceCents ?? drink.priceCents;
  const total = unitPrice * quantity;

  const togglePref = (id: string) =>
    setPrefs((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectedPrefs = useMemo(
    () =>
      (drink.preferences ?? [])
        .filter((p) => prefs[p.id])
        .map((p) => p.label),
    [drink.preferences, prefs],
  );

  return (
    // Mesma correcao do FoodDetail: h-dvh + overflow-hidden no root
    // pra garantir que flex-1 tenha altura limitada e o footer
    // "Adicionar ao pedido" nao seja empurrado abaixo do viewport
    // no Safari iOS.
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="mb-4 mt-2 flex h-9 w-9 items-center justify-center rounded-full border-[1.2px] border-ink"
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

        <div
          className="mb-5 flex h-[200px] items-center justify-center rounded-[24px] border-[1.3px] border-border-soft"
          style={{
            background:
              'repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #efede8 6px, #efede8 12px)',
          }}
        >
          <svg width="110" height="140" viewBox="0 0 110 140" fill="none" aria-hidden>
            <path
              d="M20 20 L90 20 L80 130 Q55 138 30 130 Z"
              stroke="currentColor"
              strokeWidth="2"
              fill="#fff"
              strokeLinejoin="round"
              className="text-ink"
            />
            <path d="M24 40 L86 40" stroke="currentColor" strokeWidth="1" opacity="0.3" className="text-ink" />
            <path
              d="M26 60 Q55 55 84 60 L80 130 Q55 138 30 130 Z"
              fill="currentColor"
              opacity="0.1"
              className="text-ink"
            />
            <circle cx="45" cy="80" r="2.5" fill="currentColor" opacity="0.3" className="text-ink" />
            <circle cx="62" cy="90" r="2" fill="currentColor" opacity="0.3" className="text-ink" />
            <circle cx="40" cy="100" r="1.8" fill="currentColor" opacity="0.3" className="text-ink" />
            <circle cx="68" cy="70" r="1.5" fill="currentColor" opacity="0.3" className="text-ink" />
            <circle
              cx="55"
              cy="22"
              r="12"
              fill="#fff"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-ink"
            />
            <circle
              cx="55"
              cy="22"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.5"
              className="text-ink"
            />
          </svg>
        </div>

        {drink.tags && drink.tags.length > 0 && (
          <div className="mb-2.5 flex gap-1.5">
            {drink.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-ink px-2.5 py-[3px] text-[10px] font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <h1 className="mb-1 text-[26px] font-semibold tracking-[-0.02em]">{drink.name}</h1>
        <div className="mb-3.5 text-[20px] font-semibold tabular-nums">
          R$ {(unitPrice / 100).toFixed(2).replace('.', ',')}
        </div>

        {drink.description && (
          <p className="mb-5 text-[14px] leading-[1.6] text-mute text-pretty">
            {drink.description}
          </p>
        )}

        {drink.sizes && drink.sizes.length > 0 && (
          <div className="mb-5">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
              Tamanho
            </div>
            <div className="flex gap-2">
              {drink.sizes.map((s, i) => {
                const sel = sizeIndex === i;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setSizeIndex(i)}
                    className={`flex-1 rounded-[14px] border-[1.3px] bg-bg px-3.5 py-3 text-left ${
                      sel ? 'border-ink' : 'border-border-soft'
                    }`}
                  >
                    <div className="text-[13px] font-semibold">{s.label}</div>
                    <div className="mt-0.5 text-[12px] tabular-nums text-mute">
                      R$ {(s.priceCents / 100).toFixed(2).replace('.', ',')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {drink.preferences && drink.preferences.length > 0 && (
          <div className="mb-5">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
              Preferências
            </div>
            <div>
              {drink.preferences.map((p, i) => {
                const sel = Boolean(prefs[p.id]);
                const last = i === (drink.preferences?.length ?? 0) - 1;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePref(p.id)}
                    className={`flex w-full items-center gap-3 py-2.5 text-left ${
                      last ? '' : 'border-b border-border-soft'
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.3px] ${
                        sel ? 'border-ink bg-ink text-white' : 'border-border-soft'
                      }`}
                    >
                      {sel && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                          <path
                            d="M2 5.5 4.5 8 9 3"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="text-[14px] text-ink">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-5">
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
            Quantidade
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Diminuir"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-full border-[1.3px] border-ink bg-bg text-[18px] font-semibold"
            >
              −
            </button>
            <div className="min-w-6 text-center text-[20px] font-semibold tabular-nums">
              {quantity}
            </div>
            <button
              type="button"
              aria-label="Aumentar"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border-[1.3px] border-ink bg-ink text-[18px] font-semibold text-white"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-[22px] pb-safe pt-2.5">
        <PillButton
          variant="filled"
          fullWidth
          disabled={isAdding}
          onClick={() =>
            onAdd({
              size: chosenSize?.label,
              preferences: selectedPrefs,
              quantity,
              priceCents: unitPrice,
            })
          }
        >
          {isAdding
            ? 'Adicionando…'
            : `Adicionar ao pedido · R$ ${(total / 100).toFixed(2).replace('.', ',')}`}
        </PillButton>
      </div>
    </div>
  );
}
