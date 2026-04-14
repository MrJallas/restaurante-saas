'use client';

import { useState } from 'react';
import { Minus, Plus, ChevronLeft, Users, User, UtensilsCrossed } from 'lucide-react';
import { formatCents } from '../../lib/format';

interface Extra {
  id: string;
  name: string;
  priceCents: number;
  isAvailable?: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  short_description?: string;
  long_description?: string;
  price_cents: number;
  image_url?: string;
  tags?: string[];
  allergens?: string[];
  ingredients?: string[];
  calories?: number;
  prep_time_minutes?: number;
  category_name?: string;
  extras: Extra[];
}

interface ItemDetailProps {
  item: MenuItem;
  onBack: () => void;
  onOrder: (data: {
    menuItemId: string;
    quantity: number;
    notes: string;
    extraIds: string[];
    billingMode: 'table' | 'individual';
  }) => void;
  isOrdering: boolean;
  hasIdentification: boolean;
}

export function ItemDetail({ item, onBack, onOrder, isOrdering, hasIdentification }: ItemDetailProps) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());

  const toggleExtra = (id: string) => {
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const extrasTotal = item.extras
    .filter((e) => selectedExtras.has(e.id))
    .reduce((sum, e) => sum + e.priceCents, 0);

  const unitTotal = item.price_cents + extrasTotal;
  const totalCents = unitTotal * quantity;

  const handleOrder = (billingMode: 'table' | 'individual') => {
    onOrder({
      menuItemId: item.id,
      quantity,
      notes,
      extraIds: Array.from(selectedExtras),
      billingMode,
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-primary">
      {/* Header image / placeholder */}
      <div className="relative">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-56 w-full object-cover"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-white/5">
            <UtensilsCrossed className="h-16 w-16 text-white/20" />
          </div>
        )}
        <button
          onClick={onBack}
          className="absolute left-4 top-4 rounded-full bg-black/40 p-2 backdrop-blur-sm"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {/* Name & category */}
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h1 className="font-hero text-xl font-bold text-white">{item.name}</h1>
            {item.category_name && (
              <span className="text-xs text-white/40">{item.category_name}</span>
            )}
          </div>
          <span className="shrink-0 font-body text-lg font-bold text-accent">
            {formatCents(item.price_cents)}
          </span>
        </div>

        {/* Description */}
        {item.long_description && (
          <p className="mt-2 text-sm leading-relaxed text-white/60">{item.long_description}</p>
        )}
        {!item.long_description && item.short_description && (
          <p className="mt-2 text-sm leading-relaxed text-white/60">{item.short_description}</p>
        )}

        {/* Meta info */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/40">
          {item.prep_time_minutes && <span>⏱ {item.prep_time_minutes} min</span>}
          {item.calories && <span>🔥 {item.calories} kcal</span>}
        </div>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/50"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Allergens */}
        {item.allergens && item.allergens.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-medium text-yellow-400/80">Alergenos: </span>
            <span className="text-xs text-white/40">{item.allergens.join(', ')}</span>
          </div>
        )}

        {/* Extras */}
        {item.extras.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-white/80">Adicionais</h3>
            <div className="space-y-2">
              {item.extras
                .filter((e) => e.isAvailable !== false)
                .map((extra) => (
                  <button
                    key={extra.id}
                    onClick={() => toggleExtra(extra.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                      selectedExtras.has(extra.id)
                        ? 'bg-accent/20 ring-1 ring-accent/40'
                        : 'bg-white/5'
                    }`}
                  >
                    <span className="text-sm text-white/80">{extra.name}</span>
                    <span className="text-sm text-accent">+{formatCents(extra.priceCents)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-white/80">Observacoes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: sem cebola, ponto da carne..."
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
          />
        </div>

        {/* Quantity selector */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-white/80">Quantidade</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="rounded-full bg-white/10 p-1.5 text-white/60 hover:bg-white/20"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[2ch] text-center text-lg font-bold text-white">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="rounded-full bg-white/10 p-1.5 text-white/60 hover:bg-white/20"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Total */}
        <div className="mt-4 rounded-lg bg-white/5 px-4 py-3 text-center">
          <span className="text-sm text-white/50">Total: </span>
          <span className="text-lg font-bold text-accent">{formatCents(totalCents)}</span>
        </div>
      </div>

      {/* ====== BILLING MODE BUTTONS ====== */}
      {/* This is the core custom feature: two buttons for choosing billing mode at ORDER time */}
      <div className="sticky bottom-0 border-t border-white/10 bg-primary/95 px-4 py-4 backdrop-blur-sm safe-area-bottom">
        <div className="flex gap-3">
          {/* Comanda da Mesa — shared table bill */}
          <button
            onClick={() => handleOrder('table')}
            disabled={isOrdering}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3.5 font-body text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            <div className="flex flex-col items-start">
              <span>Comanda da mesa</span>
              <span className="text-[10px] font-normal opacity-70">{formatCents(totalCents)}</span>
            </div>
          </button>

          {/* Minha Comanda — individual bill */}
          <button
            onClick={() => handleOrder('individual')}
            disabled={isOrdering || !hasIdentification}
            title={
              !hasIdentification
                ? 'Identifique-se para usar comanda individual'
                : undefined
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-accent bg-transparent py-3.5 font-body text-sm font-bold text-accent transition-opacity hover:bg-accent/10 disabled:opacity-30"
          >
            <User className="h-4 w-4" />
            <div className="flex flex-col items-start">
              <span>Minha comanda</span>
              <span className="text-[10px] font-normal opacity-70">{formatCents(totalCents)}</span>
            </div>
          </button>
        </div>
        {!hasIdentification && (
          <p className="mt-2 text-center text-xs text-white/40">
            Para comanda individual, identifique-se na tela inicial.
          </p>
        )}
      </div>
    </div>
  );
}
