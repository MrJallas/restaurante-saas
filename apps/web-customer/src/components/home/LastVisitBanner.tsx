'use client';

interface LastVisitBannerProps {
  lastItems: { name: string }[];
  slug: string;
}

export function LastVisitBanner({ lastItems, slug }: LastVisitBannerProps) {
  if (!lastItems || lastItems.length === 0) return null;

  const itemNames = lastItems.slice(0, 3).map((i) => i.name).join(', ');

  return (
    <div className="mt-4 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
      <p className="text-sm text-white/70">
        Na sua ultima visita: <span className="font-medium text-white">{itemNames}</span>
      </p>
      <a
        href={`/${slug}/cardapio`}
        className="mt-2 inline-block text-sm font-medium text-accent transition-colors hover:text-accent/80"
      >
        Pedir algo parecido →
      </a>
    </div>
  );
}
