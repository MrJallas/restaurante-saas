'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle, ChefHat, Bell, XCircle, Users, User, RefreshCw } from 'lucide-react';
import { staffGet, staffPatch } from '../../../lib/api';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  subtotalCents: number;
  notes?: string;
}

interface Order {
  id: string;
  status: string;
  billing_mode: string;
  total_cents: number;
  notes?: string;
  created_at: string;
  items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string; bgColor: string }> = {
  open: { label: 'Novo', icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  preparing: { label: 'Preparando', icon: ChefHat, color: 'text-orange-400', bgColor: 'bg-orange-400/10' },
  ready: { label: 'Pronto', icon: Bell, color: 'text-green-400', bgColor: 'bg-green-400/10' },
  delivered: { label: 'Entregue', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-600/10' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/10' },
};

const NEXT_STATUS: Record<string, string> = {
  open: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export default function GarcomPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await staffGet<{ orders: Order[] }>(`/${TENANT_SLUG}/orders`);
      setOrders(res.orders);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleAdvanceStatus = async (orderId: string, nextStatus: string) => {
    try {
      await staffPatch(`/${TENANT_SLUG}/orders/${orderId}/status`, {
        status: nextStatus,
        changedBy: 'garcom',
      });
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar status');
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm('Cancelar este pedido?')) return;
    try {
      await staffPatch(`/${TENANT_SLUG}/orders/${orderId}/status`, {
        status: 'cancelled',
        changedBy: 'garcom',
      });
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  };

  const activeOrders = orders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status),
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-staff-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-staff-bg p-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Pedidos Ativos</h1>
          <button
            onClick={() => { setRefreshing(true); loadOrders(); }}
            className="flex items-center gap-2 rounded-lg bg-staff-card px-4 py-2 text-sm text-slate-300 hover:bg-staff-card/80"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Active orders count */}
        <div className="mb-4 rounded-lg bg-staff-card p-3">
          <span className="text-sm text-slate-400">
            {activeOrders.length} pedido(s) ativo(s) | {orders.length} total
          </span>
        </div>

        {/* Orders grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {activeOrders.map((order) => {
            const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;
            const nextStatus = NEXT_STATUS[order.status];
            const time = new Date(order.created_at).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div key={order.id} className="rounded-xl bg-staff-card p-4">
                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-full p-1.5 ${statusCfg.bgColor}`}>
                      <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
                    </div>
                    <span className={`text-sm font-semibold ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.billing_mode === 'table' ? (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Users className="h-3 w-3" /> Mesa
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-staff-accent">
                        <User className="h-3 w-3" /> Individual
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{time}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="mb-3 space-y-1">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-slate-300">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-slate-500">{formatCents(item.subtotalCents)}</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {order.notes && (
                  <p className="mb-3 rounded bg-yellow-400/5 px-2 py-1 text-xs text-yellow-300">
                    Obs: {order.notes}
                  </p>
                )}

                {/* Total + actions */}
                <div className="flex items-center justify-between border-t border-slate-700 pt-3">
                  <span className="font-semibold text-white">{formatCents(order.total_cents)}</span>
                  <div className="flex gap-2">
                    {nextStatus && (
                      <button
                        onClick={() => handleAdvanceStatus(order.id, nextStatus)}
                        className="rounded-lg bg-staff-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-staff-accent/80"
                      >
                        {STATUS_CONFIG[nextStatus]?.label || nextStatus}
                      </button>
                    )}
                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancel(order.id)}
                        className="rounded-lg bg-staff-danger/20 px-3 py-1.5 text-xs font-medium text-staff-danger hover:bg-staff-danger/30"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activeOrders.length === 0 && (
          <div className="py-20 text-center text-slate-500">
            Nenhum pedido ativo no momento.
          </div>
        )}
      </div>
    </div>
  );
}
