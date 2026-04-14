'use client';

import { UtensilsCrossed } from 'lucide-react';
import { formatCents } from '../../lib/format';

interface MenuItemCardProps {
  id: string;
  name: string;
  shortDescription?: string;
  priceCents: number;
  imageUrl?: string;
  tags?: string[];
  isFeatured?: boolean;
  isDaySpecial?: boolean;
  onClick: (id: string) => void;
}

export function MenuItemCard({
  id,
  name,
  shortDescription,
  priceCents,
  imageUrl,
  tags,
  isFeatured,
  isDaySpecial,
  onClick,
}: MenuItemCardProps) {
  return (
    <button
      onClick={() => onClick(id)}
      className="flex w-full gap-3 rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <UtensilsCrossed className="h-8 w-8 text-white/30" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-start gap-2">
            <h3 className="font-body text-sm font-semibold text-white">{name}</h3>
            {isDaySpecial && (
              <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent">
                Prato do dia
              </span>
            )}
            {isFeatured && !isDaySpecial && (
              <span className="shrink-0 rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                Destaque
              </span>
            )}
          </div>
          {shortDescription && (
            <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{shortDescription}</p>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-body text-sm font-bold text-accent">
            {formatCents(priceCents)}
          </span>
          {tags && tags.length > 0 && (
            <div className="flex gap-1">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
