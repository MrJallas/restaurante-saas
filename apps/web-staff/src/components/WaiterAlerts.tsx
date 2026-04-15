'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check } from 'lucide-react';
import { staffGet, staffPost } from '../lib/api';

interface WaiterCall {
  id: string;
  status: string;
  created_at: string;
  table_label: string;
  table_code: string;
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
  const [prevCount, setPrevCount] = useState(0);

  const loadCalls = useCallback(async () => {
    try {
      const data = await staffGet<WaiterCall[]>(`/${tenantSlug}/waiter-calls/pending`);
      const callList = Array.isArray(data) ? data : [];

      // Play alert if new calls arrived
      if (callList.length > prevCount && prevCount >= 0) {
        playAlertSound();
      }
      setPrevCount(callList.length);
      setCalls(callList);
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

  if (calls.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 animate-bounce text-staff-warning" />
        <span className="text-sm font-semibold text-staff-warning">
          Chamados ({calls.length})
        </span>
      </div>
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
