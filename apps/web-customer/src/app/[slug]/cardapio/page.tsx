'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';
import { recordContinuationHint } from '../../../lib/continuationHints';
import { recordCustomerEvent } from '../../../lib/customerEvents';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { AppShell } from '../../../components/layout/AppShell';
import { MenuItemRow } from '../../../components/ui/MenuItemRow';
import { PillButton } from '../../../components/ui/PillButton';

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  kind?: 'food' | 'drink';
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
  kind?: 'food' | 'drink';
}

type Tab = 'food' | 'drink';

function inferKind(cat: Category): 'food' | 'drink' {
  if (cat.kind) return cat.kind;
  const drinkKeywords = ['bebida', 'drink', 'cerveja', 'vinho', 'sem álcool', 'espumante'];
  return drinkKeywords.some((k) => cat.name.toLowerCase().includes(k)) ? 'drink' : 'food';
}

function normalizeCategory(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function categoryLooksLikeDrink(value: string): boolean {
  return /bebida|drink|vinho|cerveja|suco|agua|refrigerante/.test(normalizeCategory(value));
}

export default function CardapioPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const searchParams = useSearchParams();
  const session = useSession();
  const { commandMode, setCommandMode } = session;
  const slug = params.slug as string;

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  // Round 21 §A — quando carregado dentro do `<MenuOverlay>` iframe, o
  // AppShell (header + drawer + footer) é redundante (a sheet já tem
  // chrome próprio). `?embed=1` faz o page renderizar só o conteúdo,
  // economizando refator do component em duas formas (rota + overlay).
  const isEmbed = searchParams.get('embed') === '1';
  const requestedCategory = searchParams.get('category');
  const initialTab: Tab =
    searchParams.get('tab') === 'bebidas' ||
    (requestedCategory ? categoryLooksLikeDrink(requestedCategory) : false)
      ? 'drink'
      : 'food';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isEmbed) {
      recordContinuationHint('viu_menu');
    }
    recordCustomerEvent(slug, 'menu_viewed', {
      embedded: isEmbed,
      category: requestedCategory ?? null,
      tab,
    });
  }, [isEmbed, requestedCategory, slug, tab]);

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
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const foodCategories = useMemo(
    () => categories.filter((c) => inferKind(c) === 'food'),
    [categories],
  );
  const drinkCategories = useMemo(
    () => categories.filter((c) => inferKind(c) === 'drink'),
    [categories],
  );

  const foodItems = useMemo(() => {
    const foodCatIds = new Set(foodCategories.map((c) => c.id));
    return items.filter((it) => (it.kind ? it.kind === 'food' : foodCatIds.has(it.category_id)));
  }, [items, foodCategories]);

  const drinkItems = useMemo(() => {
    const drinkCatIds = new Set(drinkCategories.map((c) => c.id));
    return items.filter((it) => (it.kind ? it.kind === 'drink' : drinkCatIds.has(it.category_id)));
  }, [items, drinkCategories]);

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

  const currentCategories = tab === 'food' ? foodCategories : drinkCategories;
  const currentItems = tab === 'food' ? foodItems : drinkItems;

  useEffect(() => {
    if (!requestedCategory || categories.length === 0) return;
    const wanted = normalizeCategory(requestedCategory);
    const match = categories.find((cat) => {
      const normalized = normalizeCategory(cat.name);
      return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized);
    });
    if (!match) return;
    setTab(inferKind(match));
    setActiveCategory(match.id);
  }, [categories, requestedCategory]);

  const filteredByCategory = activeCategory
    ? currentItems.filter((it) => it.category_id === activeCategory)
    : currentItems;

  const handleItemClick = useCallback(
    (id: string) => {
      push(`/${slug}/cardapio/${id}`);
    },
    [push, slug],
  );

  const handleAskAI = () => {
    push(`/${slug}/assistente?prefill=${encodeURIComponent(searchQuery)}`);
  };

  if (loading) {
    const spinner = (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
    if (isEmbed) {
      return <main className="flex min-h-dvh flex-col bg-bg">{spinner}</main>;
    }
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={session.tableLabel || ''}
        activeHref={`/${slug}/cardapio`}
      >
        {spinner}
      </AppShell>
    );
  }

  const body = (
    <div className="flex flex-1 flex-col">
      <div className="shrink-0 px-[22px] pb-2.5 pt-1">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Cardápio</h1>
        {commandMode && !isEmbed && (
          <div className="mt-2 flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3 py-2 text-[11px] text-mute">
            <span className="min-w-0 flex-1 truncate">
              Lançando em:{' '}
              <b className="text-ink">
                {commandMode === 'individual' ? 'Minha comanda' : 'Comanda da mesa'}
              </b>
            </span>
            <button
              type="button"
              onClick={() =>
                setCommandMode(commandMode === 'individual' ? 'table' : 'individual', true)
              }
              className="shrink-0 rounded-full border border-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-ink"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={() => setCommandMode(null, true)}
              className="shrink-0 rounded-full border border-border-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-mute"
            >
              Redefinir
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 px-[22px] pb-2.5">
        <div className="flex gap-1 rounded-full border border-border-soft bg-surface p-1">
          <button
            type="button"
            onClick={() => {
              setTab('food');
              setActiveCategory(null);
            }}
            className={`flex-1 rounded-full px-4 py-2 text-[13px] ${
              tab === 'food' ? 'bg-ink font-semibold text-white' : 'font-medium text-mute'
            }`}
          >
            Comida{tab !== 'food' ? ` · ${foodItems.length}` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('drink');
              setActiveCategory(null);
            }}
            className={`flex-1 rounded-full px-4 py-2 text-[13px] ${
              tab === 'drink' ? 'bg-ink font-semibold text-white' : 'font-medium text-mute'
            }`}
          >
            Bebidas{tab !== 'drink' ? ` · ${drinkItems.length}` : ''}
          </button>
        </div>
      </div>

      <div className="shrink-0 px-[22px] pb-2.5">
        <div className="flex items-center gap-2.5 rounded-full border-[1.3px] border-ink bg-bg px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="m9.5 9.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === 'food' ? 'Buscar pratos, ingredientes…' : 'Buscar bebidas…'}
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpar busca"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] text-mute"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {searchResults === null && currentCategories.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-[22px] pb-2.5 pt-1.5 [&::-webkit-scrollbar]:hidden">
          {currentCategories.map((cat) => {
            const count = currentItems.filter((i) => i.category_id === cat.id).length;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(active ? null : cat.id)}
                className={`shrink-0 whitespace-nowrap rounded-full border-[1.2px] border-ink px-4 py-2 text-[13px] font-medium ${
                  active ? 'bg-ink text-white' : 'bg-bg text-ink'
                }`}
              >
                {cat.name} · {count}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-auto px-[22px] pb-6">
        {searchResults !== null ? (
          searchResults.length === 0 && searchQuery.length >= 2 ? (
            <EmptySearchState query={searchQuery} onAskAI={handleAskAI} />
          ) : (
            <div>
              <div className="py-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
                {searchResults.length} resultado
                {searchResults.length !== 1 ? 's' : ''} para “{searchQuery}”
              </div>
              {searchResults.map((item) => (
                <MenuItemRow
                  key={item.id}
                  item={{
                    id: item.id,
                    name: item.name,
                    description: item.short_description,
                    priceCents: item.price_cents,
                    tags: item.tags,
                    imageUrl: item.image_url,
                  }}
                  onClick={() => handleItemClick(item.id)}
                />
              ))}
            </div>
          )
        ) : tab === 'food' ? (
          <FoodListByCategory
            categories={foodCategories}
            items={filteredByCategory}
            activeCategoryId={activeCategory}
            onClick={handleItemClick}
          />
        ) : (
          <DrinksSectioned
            categories={drinkCategories}
            items={drinkItems}
            activeCategoryId={activeCategory}
            onClick={handleItemClick}
          />
        )}
      </div>
    </div>
  );

  if (isEmbed) {
    return <main className="flex min-h-dvh flex-col bg-bg">{body}</main>;
  }
  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel || ''}
      activeHref={`/${slug}/cardapio`}
      noMainPadding
    >
      {body}
    </AppShell>
  );
}

function FoodListByCategory({
  categories,
  items,
  activeCategoryId,
  onClick,
}: {
  categories: Category[];
  items: MenuItem[];
  activeCategoryId: string | null;
  onClick: (id: string) => void;
}) {
  const activeCat = activeCategoryId ? categories.find((c) => c.id === activeCategoryId) : null;
  const categoryLabel = activeCat
    ? `${activeCat.name} · ${items.length} opções`
    : `Tudo · ${items.length} opções`;

  return (
    <div>
      <div className="py-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
        {categoryLabel}
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-mute">Nenhum item disponível.</div>
      ) : (
        items.map((item) => (
          <MenuItemRow
            key={item.id}
            item={{
              id: item.id,
              name: item.name,
              description: item.short_description,
              priceCents: item.price_cents,
              tags: item.tags,
              imageUrl: item.image_url,
            }}
            onClick={() => onClick(item.id)}
          />
        ))
      )}
    </div>
  );
}

function DrinksSectioned({
  categories,
  items,
  activeCategoryId,
  onClick,
}: {
  categories: Category[];
  items: MenuItem[];
  activeCategoryId: string | null;
  onClick: (id: string) => void;
}) {
  const sections = activeCategoryId
    ? categories.filter((c) => c.id === activeCategoryId)
    : categories;
  return (
    <div>
      {sections.map((cat) => {
        const catItems = items.filter((i) => i.category_id === cat.id);
        if (catItems.length === 0) return null;
        return (
          <section key={cat.id} className="mb-4">
            <div className="sticky top-0 z-10 bg-bg py-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
              {cat.name} · {catItems.length}
            </div>
            {catItems.map((item) => (
              <MenuItemRow
                key={item.id}
                compact
                item={{
                  id: item.id,
                  name: item.name,
                  description: item.short_description,
                  priceCents: item.price_cents,
                  tags: item.tags,
                  imageUrl: item.image_url,
                }}
                onClick={() => onClick(item.id)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function EmptySearchState({ query, onAskAI }: { query: string; onAskAI: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[1.5px] border-border-soft text-[28px] text-faint">
        ○
      </div>
      <div>
        <div className="mb-1.5 text-[18px] font-semibold tracking-[-0.02em]">
          Nada encontrado para “{query}”
        </div>
        <div className="text-[13px] leading-[1.5] text-mute text-pretty">
          Que tal pedir sugestão para nosso assistente?
        </div>
      </div>
      <PillButton variant="filled" onClick={onAskAI}>
        ✦ Perguntar à IA
      </PillButton>
    </div>
  );
}
