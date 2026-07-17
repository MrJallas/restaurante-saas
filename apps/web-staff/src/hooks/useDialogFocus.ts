'use client';

import { useEffect, useRef } from 'react';
import { activateDialogFocus } from '../lib/dialog-focus';

/** Shared keyboard/focus contract for staff modal dialogs and bottom sheets. */
export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    return activateDialogFocus(dialogRef.current, () => onCloseRef.current());
  }, [open]);

  return dialogRef;
}
