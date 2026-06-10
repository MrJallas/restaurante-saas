'use client';

import { Check, Gift, X } from 'lucide-react';
import type { CourtesyStatus, CustomerCourtesyDto } from '@restaurant/shared-types';

interface HomeCourtesyNoticeProps {
  courtesy: CustomerCourtesyDto;
  pendingCount?: number;
  busyStatus?: Exclude<CourtesyStatus, 'pendente'> | null;
  error?: string | null;
  onRespond: (id: string, status: Exclude<CourtesyStatus, 'pendente'>) => void;
}

export function HomeCourtesyNotice({
  courtesy,
  pendingCount = 1,
  busyStatus = null,
  error,
  onRespond,
}: HomeCourtesyNoticeProps) {
  const managerName = courtesy.managerName?.trim() || 'Gerência';
  const typeLabel = courtesy.type || 'Cortesia';
  const tableLabel =
    typeof courtesy.tableNumber === 'number' ? `mesa ${courtesy.tableNumber}` : 'sua mesa';
  const extraCount = Math.max(0, pendingCount - 1);

  return (
    <section
      data-testid="home-courtesy-notice"
      className="w-full rounded-[12px] border border-border-soft bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)]"
    >
      <div className="flex items-start gap-2.5">
        <div
          aria-hidden
          className="mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning text-white"
        >
          <Gift size={14} strokeWidth={1.9} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase leading-tight tracking-[1.4px] text-warning">
                Cortesia da casa
              </div>
              <h2 className="mt-0.5 line-clamp-1 text-[14px] font-semibold leading-[1.2] tracking-[-0.008em] text-ink">
                {courtesy.item}
              </h2>
            </div>
            {extraCount > 0 && (
              <div
                data-testid="home-courtesy-count"
                className="shrink-0 rounded-full border border-border-soft bg-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-mute"
              >
                +{extraCount}
              </div>
            )}
          </div>

          <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[1.1px] text-faint">
            {typeLabel} · sem cobrança · {tableLabel}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-[1.35] text-mute">
            {managerName} enviou para esta mesa.
          </p>
          {courtesy.notes && (
            <p className="mt-0.5 truncate text-[11px] italic leading-[1.35] text-mute">
              &ldquo;{courtesy.notes}&rdquo;
            </p>
          )}

          {error && (
            <div className="mt-2 rounded-[10px] border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11px] leading-[1.35] text-danger">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          data-testid="home-courtesy-accept"
          disabled={!!busyStatus}
          onClick={() => onRespond(courtesy.id, 'aceita')}
          className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-[11px] border-[1.2px] border-ink bg-ink px-2.5 text-[12px] font-semibold text-bg disabled:opacity-45"
        >
          <Check size={14} strokeWidth={2.2} />
          {busyStatus === 'aceita' ? 'Aceitando' : 'Aceitar'}
        </button>
        <button
          type="button"
          data-testid="home-courtesy-reject"
          disabled={!!busyStatus}
          onClick={() => onRespond(courtesy.id, 'recusada')}
          className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-[11px] border-[1.2px] border-ink/35 bg-bg px-2.5 text-[12px] font-semibold text-ink disabled:opacity-45"
        >
          <X size={14} strokeWidth={2.2} />
          {busyStatus === 'recusada' ? 'Recusando' : 'Recusar'}
        </button>
      </div>
    </section>
  );
}
