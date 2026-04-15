'use client';

import { useState, useEffect } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { apiPost } from '../../lib/api';

interface CallWaiterButtonProps {
  slug: string;
}

type CallState = 'idle' | 'calling' | 'pending' | 'acknowledged';

export function CallWaiterButton({ slug }: CallWaiterButtonProps) {
  const [state, setState] = useState<CallState>('idle');

  // Reset after 30 seconds
  useEffect(() => {
    if (state === 'pending' || state === 'acknowledged') {
      const timer = setTimeout(() => setState('idle'), 30000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const handleCall = async () => {
    if (state !== 'idle') return;
    setState('calling');

    try {
      await apiPost(`/${slug}/waiter-calls`, {});
      setState('pending');
    } catch {
      setState('idle');
    }
  };

  if (state === 'acknowledged') {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600/20 py-3 text-sm font-medium text-green-400"
      >
        <Check className="h-5 w-5" />
        Garcom chegando...
      </button>
    );
  }

  if (state === 'pending') {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/20 py-3 text-sm font-medium text-accent"
      >
        <Bell className="h-5 w-5 animate-bounce" />
        Garcom chamado!
      </button>
    );
  }

  return (
    <button
      onClick={handleCall}
      disabled={state === 'calling'}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/20 active:scale-[0.98] disabled:opacity-50"
    >
      {state === 'calling' ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Bell className="h-5 w-5 text-accent" />
      )}
      Chamar garcom
    </button>
  );
}
