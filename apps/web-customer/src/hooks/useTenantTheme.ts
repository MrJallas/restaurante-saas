'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';

interface TenantTheme {
  restaurantName: string;
  // colorPrimary/colorSecondary nao sao mais aplicados — identidade do
  // app e monocromatica (preto+branco). Mantemos so colorAccent que
  // tenants podem customizar.
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

        // Identidade visual é monocromática (branco + preto). Tenant só pode
        // customizar o accent, que aparece em poucos highlights.
        const root = document.documentElement;
        if (data.colorAccent) {
          root.style.setProperty('--color-accent', data.colorAccent);
        }
        root.style.setProperty('--font-hero', `'${data.fontHero}', sans-serif`);
        root.style.setProperty('--font-body', `'${data.fontBody}', sans-serif`);

        const fonts = new Set([data.fontHero, data.fontBody]);
        fonts.forEach((font) => {
          if (font === 'Inter') return;
          const link = document.createElement('link');
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;500;600;700&display=swap`;
          link.rel = 'stylesheet';
          document.head.appendChild(link);
        });
      } catch {
        // Usa defaults monocromáticos
      } finally {
        setIsLoading(false);
      }
    }

    loadTheme();
  }, [slug]);

  return { theme, isLoading };
}
