'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ChefHat, Bell, Volume2, User } from 'lucide-react';
import { staffGet, staffPatch } from '../../lib/api';

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

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG || 'restaurant_dev';

function TimerBadge({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const update = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="flex items-center gap-1 rounded bg-black/30 px-2 py-0.5 font-mono text-xs text-white/70">
      <Clock className="h-3 w-3" />
      {elapsed}
    </span>
  );
}

export default function CozinhaKDS() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevCountRef = useRef(0);

  const loadOrders = useCallback(async () => {
    try {
      const res = await staffGet<{ orders: Order[] }>(`/${TENANT_SLUG}/orders`);
      const activeOrders = res.orders.filter(
        (o) => !['delivered', 'cancelled'].includes(o.status),
      );

      // Play beep if new orders arrived
      if (soundEnabled && activeOrders.length > prevCountRef.current && prevCountRef.current > 0) {
        playBeep();
      }
      prevCountRef.current = activeOrders.length;

      setOrders(activeOrders);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleAdvanceStatus = async (orderId: string, nextStatus: string) => {
    try {
      await staffPatch(`/${TENANT_SLUG}/orders/${orderId}/status`, {
        status: nextStatus,
        changedBy: 'cozinha',
      });
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro');
    }
  };

  const newOrders = orders.filter((o) => ['open', 'confirmed'].includes(o.status));
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-yellow-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          <ChefHat className="mr-2 inline h-7 w-7 text-orange-400" />
          Cozinha — KDS
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              soundEnabled ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
            }`}
          >
            <Volume2 className="h-4 w-4" />
            Som {soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => router.push('/cozinha/eu')}
            aria-label="Perfil"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 hover:text-white"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3-column kanban */}
      <div className="grid grid-cols-3 gap-4">
        {/* Column: Novos */}
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-t-lg bg-yellow-500/20 px-4 py-2">
            <Clock className="h-5 w-5 text-yellow-400" />
            <span className="font-bold text-yellow-400">NOVOS</span>
            <span className="ml-auto rounded-full bg-yellow-400/30 px-2 text-sm text-yellow-300">
              {newOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {newOrders.map((order) => (
              <KdsCard
                key={order.id}
                order={order}
                color="yellow"
                onAdvance={() =>
                  handleAdvanceStatus(
                    order.id,
                    order.status === 'open' ? 'confirmed' : 'preparing',
                  )
                }
                actionLabel={order.status === 'open' ? 'Confirmar' : 'Preparar'}
              />
            ))}
          </div>
        </div>

        {/* Column: Preparando */}
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-t-lg bg-orange-500/20 px-4 py-2">
            <ChefHat className="h-5 w-5 text-orange-400" />
            <span className="font-bold text-orange-400">PREPARANDO</span>
            <span className="ml-auto rounded-full bg-orange-400/30 px-2 text-sm text-orange-300">
              {preparingOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {preparingOrders.map((order) => (
              <KdsCard
                key={order.id}
                order={order}
                color="orange"
                onAdvance={() => handleAdvanceStatus(order.id, 'ready')}
                actionLabel="Pronto!"
              />
            ))}
          </div>
        </div>

        {/* Column: Prontos */}
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-t-lg bg-green-500/20 px-4 py-2">
            <Bell className="h-5 w-5 text-green-400" />
            <span className="font-bold text-green-400">PRONTOS</span>
            <span className="ml-auto rounded-full bg-green-400/30 px-2 text-sm text-green-300">
              {readyOrders.length}
            </span>
          </div>
          <div className="space-y-3">
            {readyOrders.map((order) => (
              <KdsCard
                key={order.id}
                order={order}
                color="green"
                onAdvance={() => handleAdvanceStatus(order.id, 'delivered')}
                actionLabel="Entregue"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KdsCard({
  order,
  color,
  onAdvance,
  actionLabel,
}: {
  order: Order;
  color: 'yellow' | 'orange' | 'green';
  onAdvance: () => void;
  actionLabel: string;
}) {
  const borderColor = {
    yellow: 'border-yellow-500/30',
    orange: 'border-orange-500/30',
    green: 'border-green-500/30',
  }[color];

  const btnColor = {
    yellow: 'bg-yellow-500 hover:bg-yellow-600',
    orange: 'bg-orange-500 hover:bg-orange-600',
    green: 'bg-green-500 hover:bg-green-600',
  }[color];

  return (
    <div className={`rounded-xl border ${borderColor} bg-gray-900 p-4`}>
      {/* Timer */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-white/40">
          #{order.id.slice(0, 8)}
        </span>
        <TimerBadge createdAt={order.created_at} />
      </div>

      {/* Items — big and bold for kitchen visibility */}
      <div className="mb-3 space-y-2">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className="text-lg font-bold text-white">
              {item.quantity}x {item.name}
            </div>
            {item.notes && (
              <div className="mt-0.5 rounded bg-red-600/30 px-2 py-1 text-sm font-bold uppercase text-red-300">
                ⚠ {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Order notes */}
      {order.notes && (
        <div className="mb-3 rounded bg-yellow-600/20 px-2 py-1 text-sm text-yellow-300">
          Obs: {order.notes}
        </div>
      )}

      {/* Action */}
      <button
        onClick={onAdvance}
        className={`w-full rounded-lg ${btnColor} py-2.5 font-bold text-white transition-colors`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch {
    // Audio not supported
  }
}
