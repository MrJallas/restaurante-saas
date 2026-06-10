'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Truck } from 'lucide-react';
import { staffGet, staffPost } from '../lib/api';

interface WaiterCall {
  id: string;
  status: string;
  created_at: string;
  table_label: string;
  table_code: string;
}

interface HandoffOrder {
  id: string;
  status: string;
  table_label?: string | null;
  table_number?: number | null;
  delivery_status?: string | null;
  delivery_target_waiter_id?: string | null;
  delivery_target_waiter_name?: string | null;
  delivery_called_at?: string | null;
  items: Array<{ id: string; name: string; quantity: number }>;
}

interface WaiterAlertsProps {
  tenantSlug: string;
}

function playAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    // Two-tone alert
    [660, 880].forEach((freq, i) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      const start = audioCtx.currentTime + i * 0.2;
      gainNode.gain.setValueAtTime(0.3, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  } catch {
    // Audio not supported
  }
}

export function WaiterAlerts({ tenantSlug }: WaiterAlertsProps) {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffOrder[]>([]);
  const [prevCount, setPrevCount] = useState(0);

  const loadCalls = useCallback(async () => {
    try {
      const [data, ordersRes] = await Promise.all([
        staffGet<WaiterCall[]>(`/${tenantSlug}/waiter-calls/pending`),
        staffGet<{ orders: HandoffOrder[] }>(`/${tenantSlug}/orders`),
      ]);
      const callList = Array.isArray(data) ? data : [];
      const staffId = readStaffId();
      const handoffList = (ordersRes.orders ?? []).filter((order) => {
        if (order.status !== 'ready' || order.delivery_status !== 'pending') return false;
        return !order.delivery_target_waiter_id || order.delivery_target_waiter_id === staffId;
      });

      const total = callList.length + handoffList.length;
      if (total > prevCount && prevCount >= 0) {
        playAlertSound();
      }
      setPrevCount(total);
      setCalls(callList);
      setHandoffs(handoffList);
    } catch {
      // silently fail
    }
  }, [tenantSlug, prevCount]);

  useEffect(() => {
    loadCalls();
    const interval = setInterval(loadCalls, 5000);
    return () => clearInterval(interval);
  }, [loadCalls]);

  const handleAcknowledge = async (callId: string) => {
    try {
      await staffPost(`/${tenantSlug}/waiter-calls/${callId}/acknowledge`, {});
      setCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch {
      // silently fail
    }
  };

  const handlePickup = async (orderId: string) => {
    try {
      await staffPost(`/${tenantSlug}/orders/${orderId}/in-transit`, {});
      setHandoffs((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      // silently fail
    }
  };

  if (calls.length === 0 && handoffs.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 animate-bounce text-staff-warning" />
        <span className="text-sm font-semibold text-staff-warning">
          Chamados ({calls.length + handoffs.length})
        </span>
      </div>
      {handoffs.map((order) => {
        const calledAt = order.delivery_called_at ?? new Date().toISOString();
        const elapsed = Math.floor((Date.now() - new Date(calledAt).getTime()) / 1000);
        const mins = Math.floor(elapsed / 60);
        return (
          <div
            key={order.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 animate-pulse"
          >
            <div className="min-w-0">
              <span className="text-lg font-bold text-white">
                {order.table_label || `Mesa ${order.table_number || '—'}`}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {mins > 0 ? `ha ${mins} min` : 'agora'}
              </span>
              <div className="truncate text-xs text-slate-300">
                {order.items.map((item) => `${item.quantity}x ${item.name}`).join(' + ')}
              </div>
            </div>
            <button
              onClick={() => handlePickup(order.id)}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
            >
              <Truck className="h-4 w-4" />
              Estou levando
            </button>
          </div>
        );
      })}
      {calls.map((call) => {
        const elapsed = Math.floor(
          (Date.now() - new Date(call.created_at).getTime()) / 1000,
        );
        const mins = Math.floor(elapsed / 60);

        return (
          <div
            key={call.id}
            className="flex items-center justify-between rounded-xl border border-staff-warning/30 bg-staff-warning/10 p-3 animate-pulse"
          >
            <div>
              <span className="text-lg font-bold text-white">{call.table_label}</span>
              <span className="ml-2 text-xs text-slate-400">
                {mins > 0 ? `ha ${mins} min` : 'agora'}
              </span>
            </div>
            <button
              onClick={() => handleAcknowledge(call.id)}
              className="flex items-center gap-1 rounded-lg bg-staff-success px-4 py-2 text-sm font-medium text-white hover:bg-staff-success/80"
            >
              <Check className="h-4 w-4" />
              Estou indo
            </button>
          </div>
        );
      })}
    </div>
  );
}

function readStaffId(): string | null {
  try {
    return window.localStorage.getItem('staffId');
  } catch {
    return null;
  }
}
