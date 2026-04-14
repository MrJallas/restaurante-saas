'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';
import { useSession } from '../../../hooks/useSession';
import { AppShell } from '../../../components/layout/AppShell';
import { CategoryTabs } from '../../../components/cardapio/CategoryTabs';
import { MenuItemCard } from '../../../components/cardapio/MenuItemCard';
import { SearchBar } from '../../../components/cardapio/SearchBar';

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

interface MenuItem {
  id: string;
  name: string;
  short_description: string;
  price_cents: number;
  image_url: string | null;
  tags: string[];
  allergens: string[];
  is_featured: boolean;
  is_day_special: boolean;
  category_id: string;
}

export default function CardapioPage() {
  const params = useParams();
  const router = useRouter();
  const session = useSession();
  const slug = params.slug as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Load categories and all items
  useEffect(() => {
    if (!slug) return;

    const load = async () => {
      try {
        const [catRes, itemsRes] = await Promise.all([
          apiGet<{ categories: Category[] }>(`/${slug}/menu/categories`),
          apiGet<{ items: MenuItem[] }>(`/${slug}/menu/items`),
        ]);
        setCategories(catRes.categories);
        setItems(itemsRes.items);
      } catch {
        // Error handled by api wrapper (401 redirect)
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  // Filter items by category
  const filteredItems = activeCategory
    ? items.filter((i) => i.category_id === activeCategory)
    : items;

  // Search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiGet<{ items: MenuItem[] }>(
          `/${slug}/menu/search?q=${encodeURIComponent(searchQuery)}`,
        );
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, slug]);

  const displayItems = searchResults !== null ? searchResults : filteredItems;

  const handleItemClick = useCallback(
    (id: string) => {
      router.push(`/${slug}/cardapio/${id}`);
    },
    [router, slug],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      logoUrl={null}
      tableLabel={session.tableLabel || ''}
    >
      <div className="space-y-4">
        <h1 className="font-hero text-xl font-bold text-white">Cardapio</h1>

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {searchResults === null && (
          <CategoryTabs
            categories={categories}
            activeId={activeCategory}
            onSelect={setActiveCategory}
          />
        )}

        {searchResults !== null && (
          <p className="text-xs text-white/40">
            {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para &quot;{searchQuery}&quot;
          </p>
        )}

        <div className="space-y-2">
          {displayItems.map((item) => (
            <MenuItemCard
              key={item.id}
              id={item.id}
              name={item.name}
              shortDescription={item.short_description}
              priceCents={item.price_cents}
              imageUrl={item.image_url || undefined}
              tags={item.tags}
              isFeatured={item.is_featured}
              isDaySpecial={item.is_day_special}
              onClick={handleItemClick}
            />
          ))}

          {displayItems.length === 0 && (
            <div className="py-12 text-center text-sm text-white/40">
              {searchResults !== null
                ? 'Nenhum item encontrado.'
                : 'Nenhum item disponivel nesta categoria.'}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
