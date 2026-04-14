'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost } from '../../../../lib/api';
import { useSession } from '../../../../hooks/useSession';
import { ItemDetail } from '../../../../components/cardapio/ItemDetail';

interface Extra {
  id: string;
  name: string;
  priceCents: number;
  isAvailable?: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  short_description?: string;
  long_description?: string;
  price_cents: number;
  image_url?: string;
  tags?: string[];
  allergens?: string[];
  ingredients?: string[];
  calories?: number;
  prep_time_minutes?: number;
  category_name?: string;
  extras: Extra[];
}

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const session = useSession();
  const slug = params.slug as string;
  const itemId = params.itemId as string;

  const [item, setItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    if (!slug || !itemId) return;

    const load = async () => {
      try {
        const data = await apiGet<MenuItem>(`/${slug}/menu/items/${itemId}`);
        setItem(data);
      } catch {
        router.push(`/${slug}/cardapio`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, itemId, router]);

  const handleOrder = async (data: {
    menuItemId: string;
    quantity: number;
    notes: string;
    extraIds: string[];
    billingMode: 'table' | 'individual';
  }) => {
    setIsOrdering(true);
    try {
      await apiPost(`/${slug}/orders`, {
        billingMode: data.billingMode,
        visitId: session.visitId || undefined,
        notes: data.notes || undefined,
        items: [
          {
            menuItemId: data.menuItemId,
            quantity: data.quantity,
            notes: data.notes || undefined,
            extraIds: data.extraIds.length > 0 ? data.extraIds : undefined,
          },
        ],
      });

      setOrderSuccess(true);
      setTimeout(() => {
        router.push(`/${slug}/pedido`);
      }, 1500);
    } catch {
      setIsOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-primary px-6">
        <div className="animate-bounce text-5xl">✅</div>
        <h2 className="mt-4 font-hero text-xl font-bold text-white">Pedido enviado!</h2>
        <p className="mt-1 text-sm text-white/50">Redirecionando para seus pedidos...</p>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ItemDetail
      item={item}
      onBack={() => router.push(`/${slug}/cardapio`)}
      onOrder={handleOrder}
      isOrdering={isOrdering}
      hasIdentification={!!session.visitId}
    />
  );
}
