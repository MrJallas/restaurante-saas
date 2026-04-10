'use client';

interface HighlightItem {
  id: string;
  name: string;
  shortDescription: string | null;
  priceCents: number;
  imageUrl: string | null;
  badge: string | null;
}

interface HighlightCardsProps {
  items: HighlightItem[];
  slug: string;
}

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function HighlightCards({ items, slug }: HighlightCardsProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
        Destaques
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item) => (
          <a
            key={item.id}
            href={`/${slug}/cardapio/${item.id}`}
            className="flex-none w-40 rounded-xl bg-white/10 backdrop-blur-sm overflow-hidden transition-transform hover:scale-[1.02] active:scale-95"
          >
            {item.imageUrl ? (
              <div className="h-24 w-full bg-white/5">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="flex h-24 w-full items-center justify-center bg-white/5">
                <span className="text-2xl">🍽️</span>
              </div>
            )}
            <div className="p-3">
              {item.badge && (
                <span className="mb-1 inline-block rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {item.badge}
                </span>
              )}
              <p className="text-sm font-medium text-white line-clamp-1">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-accent">{formatPrice(item.priceCents)}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
