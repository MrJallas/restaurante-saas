'use client';

import { useContext, useEffect, useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { PillButton } from '../ui/PillButton';
import { SessionContext } from '../../providers/SessionProvider';
import { useDraftOrder } from '../../providers/DraftOrderProvider';

export type CommandModeChoice = 'individual' | 'table';

interface CommandPickerProps {
  open: boolean;
  priceCents: number;
  onClose: () => void;
  onConfirm: (mode: CommandModeChoice) => void;
}

export function CommandPicker({ open, priceCents, onClose, onConfirm }: CommandPickerProps) {
  const { commandMode, setCommandMode, sessionId, participants } = useContext(SessionContext);
  const { items, totalCents } = useDraftOrder();
  const [selected, setSelected] = useState<CommandModeChoice>(commandMode ?? 'individual');
  const [remember, setRemember] = useState(Boolean(commandMode));

  useEffect(() => {
    if (open) {
      setSelected(commandMode ?? 'individual');
      setRemember(Boolean(commandMode));
    }
  }, [open, commandMode]);

  const individualCount = items.filter((it) => it.commandMode === 'individual').length;
  const tableCount = items.filter((it) => it.commandMode === 'table').length;
  const individualSub = items
    .filter((it) => it.commandMode === 'individual')
    .reduce((s, it) => s + it.priceCents * it.quantity, 0);
  const tableSub = items
    .filter((it) => it.commandMode === 'table')
    .reduce((s, it) => s + it.priceCents * it.quantity, 0);

  void totalCents;
  void sessionId;

  const priceLabel = `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`;
  const confirmLabel =
    selected === 'individual'
      ? `Adicionar à minha comanda · ${priceLabel}`
      : `Adicionar à comanda da mesa · ${priceLabel}`;

  const handleConfirm = () => {
    setCommandMode(remember ? selected : null, true);
    onConfirm(selected);
  };

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Escolher comanda">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
          Onde lançar este item?
        </div>
        <div className="mb-1 text-[22px] font-semibold tracking-[-0.02em]">
          Escolha a comanda
        </div>
        <p className="mb-5 text-[13px] leading-[1.5] text-mute text-pretty">
          Você pode pagar separado ou dividir com a mesa no final.
        </p>

        <button
          type="button"
          onClick={() => setSelected('individual')}
          className={`mb-2.5 flex w-full items-start gap-3 rounded-[18px] border-[1.3px] p-4 text-left ${
            selected === 'individual' ? 'border-ink bg-surface' : 'border-border-soft bg-bg'
          }`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.3px] ${
              selected === 'individual' ? 'border-ink bg-ink' : 'border-border-soft'
            }`}
          >
            {selected === 'individual' && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[15px] font-semibold tracking-[-0.01em]">Minha comanda</div>
              <span className="rounded-full border border-ink px-2 py-[1.5px] text-[9px] font-semibold uppercase tracking-[0.5px]">
                Recomendado
              </span>
            </div>
            <div className="mt-1 text-[12px] text-mute">
              {individualCount > 0
                ? `${individualCount} ${individualCount === 1 ? 'item' : 'itens'} · R$ ${(individualSub / 100)
                    .toFixed(2)
                    .replace('.', ',')}`
                : 'Você paga só o que pediu'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelected('table')}
          className={`flex w-full items-start gap-3 rounded-[18px] border-[1.3px] p-4 text-left ${
            selected === 'table' ? 'border-ink bg-surface' : 'border-border-soft bg-bg'
          }`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.3px] ${
              selected === 'table' ? 'border-ink bg-ink' : 'border-border-soft'
            }`}
          >
            {selected === 'table' && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-[-0.01em]">Comanda da mesa</div>
            <div className="mt-1 text-[12px] text-mute">
              {tableCount > 0
                ? `${tableCount} ${tableCount === 1 ? 'item' : 'itens'} · ${
                    participants.length || 1
                  } ${participants.length === 1 ? 'pessoa' : 'pessoas'} · R$ ${(tableSub / 100)
                    .toFixed(2)
                    .replace('.', ',')}`
                : 'Será dividido entre quem está na mesa'}
            </div>
          </div>
        </button>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-mute">
          <span
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.3px] ${
              remember ? 'border-ink bg-ink text-white' : 'border-border-soft'
            }`}
          >
            {remember && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
                <path
                  d="M2 5.5 4.5 8 9 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="sr-only"
          />
          Usar esta opção para os próximos itens
        </label>

        <div className="mt-5 flex gap-2.5">
          <PillButton onClick={onClose} className="flex-1">
            Cancelar
          </PillButton>
          <PillButton variant="filled" onClick={handleConfirm} className="flex-[2]">
            {confirmLabel}
          </PillButton>
        </div>
      </div>
    </BottomSheet>
  );
}
