'use client';

import Image from 'next/image';
import { useState } from 'react';
import { PillButton } from '../ui/PillButton';
import { FoodPlaceholder } from '../ui/FoodPlaceholder';

export interface FoodDetailData {
  id: string;
  name: string;
  priceCents: number;
  shortDescription?: string;
  longDescription?: string;
  imageUrl?: string | null;
  tags?: string[];
  ingredients?: string[];
  allergens?: string[];
}

interface FoodDetailProps {
  item: FoodDetailData;
  onBack: () => void;
  onAskAI: () => void;
  onAdd: (data: { note: string; quantity: number; priceCents: number }) => void;
  isAdding?: boolean;
}

export function FoodDetail({ item, onBack, onAskAI, onAdd, isAdding }: FoodDetailProps) {
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);
  const total = item.priceCents * quantity;
  const ingredientsList = item.ingredients?.join(', ') ?? null;

  return (
    // Altura EXATA do viewport (h-dvh) em vez de min-h-dvh: sem isso o
    // flex-1 nao tinha altura limitada pra scroll dentro de iPhone
    // Safari WebView, e o footer com "Adicionar ao pedido" ficava
    // empurrado abaixo do viewport, inacessivel ao toque (P1 do
    // bug-hunt). dvh ajusta dinamicamente quando teclado/toolbar do
    // Safari aparecem. overflow-hidden no root garante que so o
    // miolo scroll, nao o body.
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="relative">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt=""
              width={1200}
              height={700}
              sizes="100vw"
              className="h-[280px] w-full object-cover"
              unoptimized
            />
          ) : (
            <FoodPlaceholder
              label="foto do prato"
              height={280}
              rounded=""
              noBorder
              className="w-full"
            />
          )}
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="absolute left-[18px] top-[50px] flex h-9 w-9 items-center justify-center rounded-full border-[1.2px] border-ink bg-bg"
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
        </div>

        <div className="px-[22px] py-[22px]">
          {item.tags && item.tags.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-ink px-2.5 py-[3px] text-[10px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <h1 className="mb-1 text-[26px] font-semibold tracking-[-0.02em]">{item.name}</h1>
          <div className="mb-4 text-[20px] font-semibold tabular-nums">
            R$ {(item.priceCents / 100).toFixed(2).replace('.', ',')}
          </div>

          {(item.longDescription || item.shortDescription) && (
            <p className="mb-5 text-[14px] leading-[1.6] text-mute text-pretty">
              {item.longDescription ?? item.shortDescription}
            </p>
          )}

          {ingredientsList && (
            <Section title="Ingredientes">
              <p className="text-[13px] leading-[1.6] text-ink text-pretty">{ingredientsList}</p>
            </Section>
          )}

          {item.allergens && item.allergens.length > 0 && (
            <Section title="Alergênicos">
              <div className="flex flex-wrap gap-1.5">
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-ink px-3 py-[5px] text-[12px]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section title="Observação">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: sem cebola, ponto da carne…"
              rows={2}
              className="w-full resize-none rounded-[14px] border-[1.2px] border-dashed border-border-soft bg-bg p-3.5 text-[13px] text-ink outline-none placeholder:italic placeholder:text-faint focus:border-solid focus:border-ink"
            />
          </Section>

          <Section title="Quantidade">
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
          </Section>
        </div>
      </div>

      <div className="shrink-0 space-y-2.5 px-[22px] pb-safe pt-2.5">
        <PillButton onClick={onAskAI} fullWidth>
          ✦ Perguntar à IA
        </PillButton>
        <PillButton
          variant="filled"
          fullWidth
          disabled={isAdding}
          onClick={() => onAdd({ note: note.trim(), quantity, priceCents: item.priceCents })}
        >
          {isAdding
            ? 'Adicionando…'
            : `Adicionar ao pedido · R$ ${(total / 100).toFixed(2).replace('.', ',')}`}
        </PillButton>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-[18px]">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
        {title}
      </div>
      {children}
    </div>
  );
}
