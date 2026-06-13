'use client';

import Image from 'next/image';
import { memo } from 'react';
import { FoodPlaceholder } from './FoodPlaceholder';

export interface MenuItemRowItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  tags?: string[];
  imageUrl?: string | null;
}

interface MenuItemRowProps {
  item: MenuItemRowItem;
  compact?: boolean;
  onClick?: () => void;
}

/**
 * Linha de prato/bebida na listagem do cardapio. A lista pode ter 40+ itens em
 * restaurantes com menu cheio — `memo` corta re-render quando o parent troca
 * o `activeCategory`/`searchQuery` sem mudar o `item` especifico. O onClick
 * ainda chega como nova referencia a cada render do parent, entao o shouldUpdate
 * cai no `item`/`compact`; vale pra lista longa.
 */
export const MenuItemRow = memo(function MenuItemRow({ item, compact, onClick }: MenuItemRowProps) {
  const price = (item.priceCents / 100).toFixed(2).replace('.', ',');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3.5 border-b border-border-soft py-3.5 text-left"
    >
      {!compact &&
        (item.imageUrl ? (
          <span className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[12px]">
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="84px"
              className="object-cover"
              unoptimized
            />
          </span>
        ) : (
          <FoodPlaceholder label="foto" height={84} className="w-[84px]" rounded="rounded-[12px]" />
        ))}
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] flex items-baseline justify-between gap-2.5">
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{item.name}</div>
          <div className="shrink-0 whitespace-nowrap text-[14px] font-semibold tabular-nums">
            R$ {price}
          </div>
        </div>
        {item.description && (
          <div
            className="mb-1.5 line-clamp-2 text-[12px] leading-[1.4] text-mute"
            style={{ textWrap: 'pretty' as never }}
          >
            {item.description}
          </div>
        )}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-ink px-2 py-[2px] text-[10px] font-medium text-ink"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
});
