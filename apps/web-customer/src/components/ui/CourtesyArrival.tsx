'use client';

import { Gift, Check, X } from 'lucide-react';
import type { CourtesyStatus, CustomerCourtesyDto } from '@restaurant/shared-types';
import { PillButton } from './PillButton';

interface CourtesyArrivalProps {
  courtesy: CustomerCourtesyDto;
  busyStatus?: Exclude<CourtesyStatus, 'pendente'> | null;
  error?: string | null;
  onRespond?: (id: string, status: Exclude<CourtesyStatus, 'pendente'>) => void;
  align?: 'start' | 'center';
  className?: string;
}

function statusCopy(status: CourtesyStatus): string {
  if (status === 'aceita') return 'Cortesia aceita';
  if (status === 'recusada') return 'Cortesia recusada';
  return 'Pendente';
}

export function CourtesyArrival({
  courtesy,
  busyStatus = null,
  error,
  onRespond,
  align = 'start',
  className = '',
}: CourtesyArrivalProps) {
  const isPending = courtesy.status === 'pendente';
  const managerName = courtesy.managerName?.trim() || 'Gerência';
  const typeLabel = courtesy.type || 'Cortesia';
  const tableLabel =
    typeof courtesy.tableNumber === 'number' ? `mesa ${courtesy.tableNumber}` : 'sua mesa';

  return (
    <div
      data-testid={`courtesy-arrival-${courtesy.id}`}
      className={`${align === 'center' ? 'w-full max-w-[360px] self-center' : 'max-w-[86%] self-start'} rounded-[14px] rounded-l-[4px] border border-border-soft border-l-[3px] border-l-warning bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`.trim()}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning text-white"
        >
          <Gift size={17} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase leading-tight tracking-[1.5px] text-warning">
            Cortesia da casa
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.7px] text-faint">
            {statusCopy(courtesy.status)} · {tableLabel}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[1.3px] text-faint">
            {typeLabel} · sem cobrança
          </div>
          <div className="mt-1 text-[18px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
            {courtesy.item}
          </div>
        </div>

        <div
          className="text-[14px] leading-[1.45] tracking-[-0.005em] text-ink"
          style={{ textWrap: 'pretty' as never }}
        >
          {managerName} mandou essa cortesia pra você. A equipe acompanha por aqui.
        </div>

        {courtesy.notes && (
          <div className="border-t border-border-soft pt-2.5 text-[13px] italic leading-[1.45] text-mute">
            &ldquo;{courtesy.notes}&rdquo;
          </div>
        )}

        {!isPending && (
          <div
            className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium ${
              courtesy.status === 'aceita'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border-soft bg-bg text-mute'
            }`}
          >
            {courtesy.status === 'aceita' ? (
              <Check size={14} strokeWidth={2} />
            ) : (
              <X size={14} strokeWidth={2} />
            )}
            {courtesy.status === 'aceita'
              ? 'Aceita. A equipe foi avisada.'
              : 'Recusada. A equipe foi avisada.'}
          </div>
        )}

        {error && (
          <div className="rounded-[10px] border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] leading-[1.4] text-danger">
            {error}
          </div>
        )}

        {isPending && onRespond && (
          <div className="flex flex-col gap-2 pt-1">
            <PillButton
              type="button"
              variant="filled"
              fullWidth
              disabled={!!busyStatus}
              onClick={() => onRespond(courtesy.id, 'aceita')}
            >
              {busyStatus === 'aceita' ? 'Aceitando...' : 'Aceitar'}
            </PillButton>
            <button
              type="button"
              disabled={!!busyStatus}
              onClick={() => onRespond(courtesy.id, 'recusada')}
              className="min-h-[44px] text-[13px] font-medium text-mute underline decoration-border-soft underline-offset-4 disabled:opacity-40"
            >
              {busyStatus === 'recusada' ? 'Recusando...' : 'Não, obrigado'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
