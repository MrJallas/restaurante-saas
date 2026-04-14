'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Users, User } from 'lucide-react';
import { apiGet } from '../../../lib/api';
import { useSession } from '../../../hooks/useSession';
import { AppShell } from '../../../components/layout/AppShell';
import { OrderCard } from '../../../components/pedido/OrderCard';
import { formatCents } from '../../../lib/format';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  notes?: string;
}

interface Order {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string;
  visit_id: string | null;
  created_at: string;
  items: OrderItem[];
}

type TabMode = 'all' | 'table' | 'individual';

export default function PedidoPage() {
  const params = useParams();
  const session = useSession();
  const slug = params.slug as string;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>('all');

  useEffect(() => {
    if (!slug) return;

    const load = async () => {
      try {
        const res = await apiGet<{ orders: Order[] }>(`/${slug}/orders`);
        setOrders(res.orders);
      } catch {
        // handled by api wrapper
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  // Refresh every 15 seconds to get status updates
  useEffect(() => {
    if (!slug) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiGet<{ orders: Order[] }>(`/${slug}/orders`);
        setOrders(res.orders);
      } catch {
        // silently fail refresh
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [slug]);

  const filteredOrders =
    activeTab === 'all'
      ? orders
      : orders.filter((o) => o.billing_mode === activeTab);

  const tableOrders = orders.filter((o) => o.billing_mode === 'table');
  const individualOrders = orders.filter(
    (o) => o.billing_mode === 'individual' && o.visit_id === session.visitId,
  );

  const tableTotal = tableOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total_cents, 0);
  const individualTotal = individualOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.total_cents, 0);

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
        <h1 className="font-hero text-xl font-bold text-white">Meus Pedidos</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-2 text-white/50">
              <Users className="h-4 w-4" />
              <span className="text-xs">Comanda da mesa</span>
            </div>
            <p className="mt-1 font-body text-lg font-bold text-white">
              {formatCents(tableTotal)}
            </p>
            <p className="text-[10px] text-white/30">{tableOrders.length} pedido(s)</p>
          </div>
          <div className="rounded-xl bg-accent/10 p-3">
            <div className="flex items-center gap-2 text-accent/70">
              <User className="h-4 w-4" />
              <span className="text-xs">Minha comanda</span>
            </div>
            <p className="mt-1 font-body text-lg font-bold text-accent">
              {formatCents(individualTotal)}
            </p>
            <p className="text-[10px] text-white/30">{individualOrders.length} pedido(s)</p>
          </div>
        </div>

        {/* Tab filter */}
        <div className="flex gap-2">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'table', label: 'Mesa' },
            { key: 'individual', label: 'Individual' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-accent text-white'
                  : 'bg-white/10 text-white/50 hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Orders list */}
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}

          {filteredOrders.length === 0 && (
            <div className="py-12 text-center text-sm text-white/40">
              {orders.length === 0
                ? 'Nenhum pedido realizado ainda.'
                : 'Nenhum pedido nesta categoria.'}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
