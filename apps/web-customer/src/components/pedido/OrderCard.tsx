'use client';

import { Clock, CheckCircle, ChefHat, Bell, XCircle, Users, User } from 'lucide-react';
import { formatCents } from '../../lib/format';

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
  created_at: string;
  items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  open: { label: 'Enviado', icon: Clock, color: 'text-yellow-400' },
  confirmed: { label: 'Confirmado', icon: CheckCircle, color: 'text-blue-400' },
  preparing: { label: 'Preparando', icon: ChefHat, color: 'text-orange-400' },
  ready: { label: 'Pronto', icon: Bell, color: 'text-green-400' },
  delivered: { label: 'Entregue', icon: CheckCircle, color: 'text-green-600' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-red-400' },
};

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.open;
  const StatusIcon = statusCfg.icon;
  const time = new Date(order.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-xl bg-white/5 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
          <span className={`text-sm font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {order.billing_mode === 'table' ? (
            <span className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
              <Users className="h-3 w-3" /> Mesa
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
              <User className="h-3 w-3" /> Individual
            </span>
          )}
          <span className="text-xs text-white/30">{time}</span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span className="text-sm text-white/70">
              {item.quantity}x {item.name}
            </span>
            <span className="text-sm text-white/50">{formatCents(item.subtotalCents)}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
        <span className="text-sm text-white/50">Total</span>
        <span className="font-body text-sm font-bold text-accent">
          {formatCents(order.total_cents)}
        </span>
      </div>
    </div>
  );
}
