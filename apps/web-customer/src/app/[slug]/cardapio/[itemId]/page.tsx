'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet } from '../../../../lib/api';
import { recordContinuationHint } from '../../../../lib/continuationHints';
import { recordCustomerEvent } from '../../../../lib/customerEvents';
import { useNav } from '../../../../hooks/useNav';
import { useDraftOrder } from '../../../../providers/DraftOrderProvider';
import { FoodDetail, FoodDetailData } from '../../../../components/cardapio/FoodDetail';
import { DrinkDetail, DrinkDetailData } from '../../../../components/cardapio/DrinkDetail';
import {
  CommandPicker,
  CommandModeChoice,
} from '../../../../components/cardapio/CommandPicker';

interface MenuItemApi {
  id: string;
  name: string;
  short_description?: string;
  long_description?: string;
  price_cents: number;
  image_url?: string | null;
  tags?: string[];
  allergens?: string[];
  ingredients?: string[];
  kind?: 'food' | 'drink';
  sizes?: { label: string; price_cents: number }[];
  preferences?: { id: string; label: string; default_selected?: boolean }[];
  category_name?: string;
}

function isDrink(it: MenuItemApi): boolean {
  if (it.kind) return it.kind === 'drink';
  const lower = (it.category_name ?? '').toLowerCase();
  return ['bebida', 'drink', 'cerveja', 'vinho', 'sem álcool', 'espumante'].some((k) =>
    lower.includes(k),
  );
}

interface PendingAdd {
  quantity: number;
  note: string;
  priceCents: number;
  size?: string;
  preferences?: string[];
}

export default function ItemDetailPage() {
  const params = useParams();
  const { push } = useNav();
  const slug = params.slug as string;
  const itemId = params.itemId as string;
  const { addItem } = useDraftOrder();

  const [item, setItem] = useState<MenuItemApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAdd | null>(null);

  useEffect(() => {
    recordContinuationHint('viu_menu');
  }, []);

  useEffect(() => {
    if (!slug || !itemId || !item) return;
    recordCustomerEvent(slug, 'item_viewed', {
      itemId,
      itemName: item?.name ?? null,
      category: item?.category_name ?? null,
    });
  }, [slug, itemId, item]);

  useEffect(() => {
    if (!slug || !itemId) return;
    const load = async () => {
      try {
        const data = await apiGet<MenuItemApi>(`/${slug}/menu/items/${itemId}`);
        setItem(data);
      } catch {
        push(`/${slug}/cardapio`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, itemId, push]);

  const handleBack = useCallback(() => {
    push(`/${slug}/cardapio`);
  }, [push, slug]);

  const handleAskAI = useCallback(() => {
    push(`/${slug}/assistente?itemId=${itemId}`);
  }, [push, slug, itemId]);

  const handleAddFood = useCallback(
    (data: { note: string; quantity: number; priceCents: number }) => {
      setPending({ ...data });
    },
    [],
  );

  const handleAddDrink = useCallback(
    (data: {
      size?: string;
      preferences: string[];
      quantity: number;
      priceCents: number;
    }) => {
      setPending({
        size: data.size,
        preferences: data.preferences,
        quantity: data.quantity,
        priceCents: data.priceCents,
        note: '',
      });
    },
    [],
  );

  const handleConfirmCommand = useCallback(
    (mode: CommandModeChoice) => {
      if (!item || !pending) return;
      addItem({
        menuItemId: item.id,
        name: item.name,
        priceCents: pending.priceCents,
        quantity: pending.quantity,
        note: pending.note || undefined,
        size: pending.size,
        preferences: pending.preferences,
        commandMode: mode,
      });
      setPending(null);
      push(`/${slug}/pedido/revisar`);
    },
    [addItem, item, pending, push, slug],
  );

  const drinkData: DrinkDetailData | null = useMemo(() => {
    if (!item || !isDrink(item)) return null;
    return {
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      description: item.long_description ?? item.short_description,
      tags: item.tags,
      sizes: item.sizes?.map((s) => ({ label: s.label, priceCents: s.price_cents })),
      preferences: item.preferences?.map((p) => ({
        id: p.id,
        label: p.label,
        defaultSelected: p.default_selected,
      })),
    };
  }, [item]);

  const foodData: FoodDetailData | null = useMemo(() => {
    if (!item || isDrink(item)) return null;
    return {
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      shortDescription: item.short_description,
      longDescription: item.long_description,
      imageUrl: item.image_url,
      tags: item.tags,
      ingredients: item.ingredients,
      allergens: item.allergens,
    };
  }, [item]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
  }

  if (!item) return null;

  return (
    <>
      {drinkData ? (
        <DrinkDetail drink={drinkData} onBack={handleBack} onAdd={handleAddDrink} />
      ) : (
        foodData && (
          <FoodDetail
            item={foodData}
            onBack={handleBack}
            onAskAI={handleAskAI}
            onAdd={handleAddFood}
          />
        )
      )}
      <CommandPicker
        open={pending !== null}
        priceCents={(pending?.priceCents ?? 0) * (pending?.quantity ?? 1)}
        onClose={() => setPending(null)}
        onConfirm={handleConfirmCommand}
      />
    </>
  );
}
