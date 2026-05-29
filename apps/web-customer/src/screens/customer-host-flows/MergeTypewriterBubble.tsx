'use client';

import { PillButton } from '../../components/ui/PillButton';
import { TypewriterBubble } from './TypewriterBubble';

interface MergeTypewriterBubbleProps {
  originHostName?: string | null;
  originTableNumber?: number | null;
  targetTableNumber?: number | null;
  originPartySize?: number;
  targetPartySize?: number;
  busy?: 'approving' | 'rejecting' | null;
  decided?: 'approved' | 'rejected' | 'waiting' | null;
  error?: string | null;
  onApprove: () => void;
  onReject: () => void;
  onOpenDetails: () => void;
}

export function MergeTypewriterBubble({
  originHostName,
  originTableNumber,
  targetTableNumber,
  originPartySize = 0,
  targetPartySize = 0,
  busy = null,
  decided = null,
  error = null,
  onApprove,
  onReject,
  onOpenDetails,
}: MergeTypewriterBubbleProps) {
  const origin =
    originHostName && originHostName.trim().length > 0
      ? `${originHostName.split(' ')[0]}${originTableNumber ? ` da Mesa ${originTableNumber}` : ''}`
      : originTableNumber
        ? `A Mesa ${originTableNumber}`
        : 'A outra mesa';
  const total = originPartySize + targetPartySize;
  const text = `${origin} quer juntar com a sua mesa.`;

  return (
    <TypewriterBubble
      text={text}
      eyebrow={
        originTableNumber && targetTableNumber
          ? `Junção Mesa ${originTableNumber} -> Mesa ${targetTableNumber} · agora`
          : 'Junção de mesas · agora'
      }
      testId="assistant-table-merge-created"
      urgent={!decided}
      skipAnimation={!!decided}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-medium leading-[1.45] text-mute">
          {total > 0
            ? `Se vocês aceitarem, a mesa fica com ${total} pessoas.`
            : 'Se vocês aceitarem, as mesas viram uma só.'}
        </p>

        {decided ? (
          <div className="inline-flex w-fit rounded-full border border-border-soft bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink">
            {decided === 'approved'
              ? 'Você confirmou'
              : decided === 'waiting'
                ? 'Aguardando a outra mesa'
                : 'Você recusou'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={!!busy}
              className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-55"
            >
              {busy === 'approving' ? 'Confirmando...' : 'Pode juntar'}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={!!busy}
              className="rounded-full border border-ink/30 bg-bg px-3.5 py-2 text-[13px] font-semibold text-ink disabled:opacity-55"
            >
              {busy === 'rejecting' ? 'Recusando...' : 'Agora não'}
            </button>
          </div>
        )}

        <PillButton variant="outline" onClick={onOpenDetails} className="w-full">
          Ver detalhes da junção
        </PillButton>

        {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
      </div>
    </TypewriterBubble>
  );
}
