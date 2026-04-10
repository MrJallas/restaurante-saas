'use client';

import { ReactNode } from 'react';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  tableLabel: string;
  children: ReactNode;
}

export function AppShell({ slug, restaurantName, logoUrl, tableLabel, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-primary">
      <TopBar
        logoUrl={logoUrl}
        restaurantName={restaurantName}
        tableLabel={tableLabel}
      />
      <main className="flex-1 px-4 pb-20 pt-4">{children}</main>
      <BottomNav slug={slug} />
    </div>
  );
}
