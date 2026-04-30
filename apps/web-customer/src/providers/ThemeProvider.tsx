'use client';

import { ReactNode } from 'react';
import { useTenantTheme } from '../hooks/useTenantTheme';

interface ThemeProviderProps {
  slug: string | null;
  children: ReactNode;
}

export function ThemeProvider({ slug, children }: ThemeProviderProps) {
  // Dispara o fetch do tema mas NUNCA troca o render por um spinner. O design
  // base ja casa com os defaults (branco/preto), entao o tema do tenant entra
  // transparente quando carregar. Substituir children por um spinner aqui
  // desmonta a MesaPage no meio da inicializacao e trava o pageState.
  useTenantTheme(slug);

  return <>{children}</>;
}
