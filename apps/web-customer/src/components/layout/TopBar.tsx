'use client';

interface TopBarProps {
  logoUrl: string | null;
  restaurantName: string;
  tableLabel: string;
}

export function TopBar({ logoUrl, restaurantName, tableLabel }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between bg-primary/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt={restaurantName} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
            {restaurantName.charAt(0)}
          </div>
        )}
        <span className="text-sm font-semibold text-white">{restaurantName}</span>
      </div>
      <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
        {tableLabel}
      </span>
    </header>
  );
}
