'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';

interface TenantTheme {
  restaurantName: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  fontHero: string;
  fontBody: string;
  logoUrl: string | null;
}

export function useTenantTheme(slug: string | null) {
  const [theme, setTheme] = useState<TenantTheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    async function loadTheme() {
      try {
        const data = await apiGet<TenantTheme>(`/${slug}/settings/public`);
        setTheme(data);

        // Aplica CSS variables
        const root = document.documentElement;
        root.style.setProperty('--color-primary', data.colorPrimary);
        root.style.setProperty('--color-secondary', data.colorSecondary);
        root.style.setProperty('--color-accent', data.colorAccent);
        root.style.setProperty('--font-hero', `'${data.fontHero}', sans-serif`);
        root.style.setProperty('--font-body', `'${data.fontBody}', sans-serif`);

        // Carrega Google Fonts dinamicamente
        const fonts = new Set([data.fontHero, data.fontBody]);
        fonts.forEach((font) => {
          if (font === 'Inter') return; // Ja carregada por padrao
          const link = document.createElement('link');
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        });
      } catch {
        // Usa defaults
      } finally {
        setIsLoading(false);
      }
    }

    loadTheme();
  }, [slug]);

  return { theme, isLoading };
}
