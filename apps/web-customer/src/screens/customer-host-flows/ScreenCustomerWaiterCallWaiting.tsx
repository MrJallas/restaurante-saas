'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiPatch } from '../../lib/api';

export interface ActiveWaiterCall {
  callId: string;
  status: string;
  reason: string;
  createdAt: string;
  waiterName?: string;
  etaMinutes?: number;
}

interface ScreenCustomerWaiterCallWaitingProps {
  slug: string;
  call: ActiveWaiterCall;
  onCancelled: (call: ActiveWaiterCall) => void;
  onRequestNew: () => void;
}

const REASON_LABELS: Record<string, string> = {
  bring_menu: 'Trazer o cardápio',
  place_order: 'Fazer pedido',
  serve_drink: 'Servir bebida',
  ask_bill: 'Pedir a conta',
  other: 'Outro motivo',
};

const DONE_STATUSES = new Set(['cancelled', 'done', 'arrived', 'resolved']);

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

export function ScreenCustomerWaiterCallWaiting({
  slug,
  call,
  onCancelled,
  onRequestNew,
}: ScreenCustomerWaiterCallWaitingProps) {
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [localCall, setLocalCall] = useState(call);

  useEffect(() => {
    setLocalCall(call);
  }, [call]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    const created = new Date(localCall.createdAt).getTime();
    if (!Number.isFinite(created)) return 0;
    return Math.max(0, Math.floor((now - created) / 1000));
  }, [localCall.createdAt, now]);

  const reason = REASON_LABELS[localCall.reason] ?? localCall.reason ?? 'Atendimento';
  const canRequestAgain = DONE_STATUSES.has(localCall.status);

  const cancel = async () => {
    if (cancelling || canRequestAgain) return;
    setCancelling(true);
    try {
      const res = await apiPatch<{ callId: string; status: string }>(
        `/${slug}/waiter-calls/${localCall.callId}/cancel`,
        {},
      );
      const cancelled = { ...localCall, status: res.status || 'cancelled' };
      setLocalCall(cancelled);
      onCancelled(cancelled);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col px-[2px] pb-2 pt-1">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[1.5px] text-mute">
        Atendimento em andamento
      </span>
      <h2 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
        Aguardando garçom
      </h2>
      <p className="mb-5 text-[13px] leading-[1.5] text-mute text-pretty">
        Já avisamos a equipe. Você pode acompanhar o tempo por aqui.
      </p>

      <div className="mb-4 rounded-[14px] border-[1.3px] border-border-soft bg-surface px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-mute">Tempo de espera</span>
          <span className="font-mono text-[18px] font-semibold text-ink">
            {formatElapsed(elapsed)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border-soft pt-3">
          <span className="text-[12px] font-medium text-mute">Motivo</span>
          <span className="text-right text-[13px] font-semibold text-ink">{reason}</span>
        </div>
        {localCall.waiterName && (
          <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-3">
            <span className="text-[12px] font-medium text-mute">Garçom</span>
            <span className="text-right text-[13px] font-semibold text-ink">
              {localCall.waiterName}
              {localCall.etaMinutes ? ` · ${localCall.etaMinutes} min` : ''}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={cancel}
          disabled={cancelling || canRequestAgain}
          className="inline-flex w-full items-center justify-center rounded-full border-[1.3px] border-ink bg-bg px-5 py-3.5 text-[14.5px] font-medium text-ink disabled:cursor-not-allowed disabled:border-border-soft disabled:text-faint"
        >
          {cancelling ? 'Cancelando…' : 'Cancelar chamado'}
        </button>
        <button
          type="button"
          onClick={onRequestNew}
          disabled={!canRequestAgain}
          className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3.5 text-[14.5px] font-medium text-white disabled:cursor-not-allowed disabled:bg-faint disabled:text-white/80"
        >
          Chamar de novo
        </button>
      </div>
    </div>
  );
}
