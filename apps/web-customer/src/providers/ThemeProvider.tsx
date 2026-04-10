'use client';

import { ReactNode } from 'react';
import { useTenantTheme } from '../hooks/useTenantTheme';

interface ThemeProviderProps {
  slug: string | null;
  children: ReactNode;
}

export function ThemeProvider({ slug, children }: ThemeProviderProps) {
  const { isLoading } = useTenantTheme(slug);

  if (isLoading && slug) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
