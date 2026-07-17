'use client';

import { ReactNode } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** If true, clicking the overlay closes the sheet. Default true. */
  closeOnOverlayClick?: boolean;
  ariaLabel?: string;
}

export function BottomSheet({
  open,
  onClose,
  children,
  closeOnOverlayClick = true,
  ariaLabel = 'Opções',
}: BottomSheetProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-dialog-initial-focus
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-32px)] overflow-y-auto rounded-t-[28px] border border-b-0 border-ink bg-bg px-6 pt-2.5 shadow-[0_-20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-border-soft" />
        <div>{children}</div>
      </div>
    </div>
  );
}
