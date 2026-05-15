'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-dismiss hook pra bottom sheets, baseado no pattern do `vaul`
 * (https://github.com/emilkowalski/vaul/blob/main/src/index.tsx).
 *
 * iOS Safari 26.x mudou comportamento em Pointer/Touch Events e ainda tem
 * bugs próximos de `preventDefault()` + scroll. Por isso o caminho touch é
 * nativo (`touchstart/move/end`, passive:false) e o caminho pointer fica para
 * mouse/desktop. A UI continua controlada por transform CSS.
 *
 * **API novo**: caller spreada `{...bind}` no JSX. Mantém `dragY`,
 * `sheetRef`, `dragHandleRef`, `isDragging` pra compat.
 */

interface UseSheetDragOptions {
  onDismiss: () => void;
  dismissThreshold?: number;
  sheetHeightPx: () => number;
  respectInteractiveTargets?: boolean;
  respectInternalScroll?: boolean;
}

const DEAD_ZONE_PX = 4;
const CLOSE_ANIMATION_MS = 200;

function hasNativeTouchEvents(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function useSheetDrag({
  onDismiss,
  dismissThreshold = 0.6,
  sheetHeightPx,
  respectInteractiveTargets = true,
  respectInternalScroll = true,
}: UseSheetDragOptions) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetNode, setSheetNode] = useState<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLDivElement | null>(null);

  const setSheetRef = useCallback((node: HTMLDivElement | null) => {
    sheetRef.current = node;
    setSheetNode(node);
  }, []);

  const [dragY, setDragYState] = useState(0);
  const dragYRef = useRef(0);
  const setDragY = useCallback((y: number) => {
    dragYRef.current = y;
    setDragYState(y);
  }, []);

  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const isAllowedToDragRef = useRef(true);
  const activeInputRef = useRef<'pointer' | 'touch' | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);

  // Keep options stable in refs so handlers don't re-bind unnecessarily.
  const onDismissRef = useRef(onDismiss);
  const sheetHeightPxRef = useRef(sheetHeightPx);
  onDismissRef.current = onDismiss;
  sheetHeightPxRef.current = sheetHeightPx;

  const isInteractive = useCallback((target: EventTarget | null): boolean => {
    if (!respectInteractiveTargets) return false;
    if (!(target instanceof HTMLElement)) return false;
    const handle = dragHandleRef.current;
    if (handle && handle.contains(target)) return false;
    return target.closest('button, a, input, textarea, select') !== null;
  }, [respectInteractiveTargets]);

  const isInScrollableAtTop = useCallback((target: EventTarget | null): boolean => {
    if (!respectInternalScroll) return true;
    if (!(target instanceof HTMLElement)) return true;
    const scrollEl = target.closest<HTMLElement>('[data-scroll-area="true"]');
    if (!scrollEl) return true;
    return scrollEl.scrollTop <= 0;
  }, [respectInternalScroll]);

  const resetDragState = useCallback((resetPosition: boolean) => {
    dragStartY.current = null;
    draggingRef.current = false;
    isAllowedToDragRef.current = true;
    activeInputRef.current = null;
    activeTouchIdRef.current = null;
    setIsDragging(false);
    if (resetPosition) setDragY(0);
  }, [setDragY]);

  const canStartDrag = useCallback((target: EventTarget | null): boolean => {
    if (isInteractive(target)) return false;
    if (!isInScrollableAtTop(target)) return false;

    // Abort if user is selecting text (vaul pattern §shouldDrag).
    const highlightedText = window.getSelection()?.toString();
    if (highlightedText && highlightedText.length > 0) return false;

    return true;
  }, [isInteractive, isInScrollableAtTop]);

  const startDrag = useCallback((
    clientY: number,
    target: EventTarget | null,
    input: 'pointer' | 'touch',
  ): boolean => {
    if (!canStartDrag(target)) return false;
    dragStartY.current = clientY;
    draggingRef.current = false;
    isAllowedToDragRef.current = true;
    activeInputRef.current = input;
    return true;
  }, [canStartDrag]);

  const updateDrag = useCallback((
    clientY: number,
    options: { allowUpwardScroll: boolean },
  ): boolean => {
    if (dragStartY.current === null) return false;
    if (!isAllowedToDragRef.current) return false;

    const delta = clientY - dragStartY.current;
    if (!draggingRef.current && Math.abs(delta) < DEAD_ZONE_PX) return false;

    if (!draggingRef.current && delta < 0 && options.allowUpwardScroll) {
      resetDragState(false);
      return false;
    }

    if (!draggingRef.current) {
      draggingRef.current = true;
      setIsDragging(true);
    }

    setDragY(delta > 0 ? delta : 0);
    return true;
  }, [resetDragState, setDragY]);

  const finishDrag = useCallback(() => {
    if (dragStartY.current === null) return;

    const heightPx = sheetHeightPxRef.current() || 720;
    const currentDragY = dragYRef.current;
    if (currentDragY / heightPx >= dismissThreshold) {
      setDragY(heightPx);
      setTimeout(() => onDismissRef.current(), CLOSE_ANIMATION_MS);
    } else {
      setDragY(0);
    }

    resetDragState(false);
  }, [dismissThreshold, resetDragState, setDragY]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && hasNativeTouchEvents()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!startDrag(e.clientY, e.target, 'pointer')) return;

    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* pode falhar se target não suporta — não crítico */
    }
  }, [startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeInputRef.current !== 'pointer') return;
    updateDrag(e.clientY, { allowUpwardScroll: false });
  }, [updateDrag]);

  const handlePointerEnd = useCallback(() => {
    if (activeInputRef.current !== 'pointer') return;
    finishDrag();
  }, [finishDrag]);

  useEffect(() => {
    const sheet = sheetNode;
    if (!sheet || !hasNativeTouchEvents()) return;

    const findTouch = (touches: TouchList): Touch | null => {
      const id = activeTouchIdRef.current;
      if (id === null) return null;
      for (let i = 0; i < touches.length; i += 1) {
        const touch = touches.item(i);
        if (touch?.identifier === id) return touch;
      }
      return null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (activeInputRef.current !== null || e.touches.length !== 1) return;
      const touch = e.touches.item(0);
      if (!touch) return;
      if (!startDrag(touch.clientY, e.target, 'touch')) return;
      activeTouchIdRef.current = touch.identifier;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activeInputRef.current !== 'touch') return;
      const touch = findTouch(e.touches);
      if (!touch) return;
      const didDrag = updateDrag(touch.clientY, { allowUpwardScroll: true });
      if (didDrag) e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (activeInputRef.current !== 'touch') return;
      if (findTouch(e.touches)) return;
      finishDrag();
    };

    const handleTouchCancel = () => {
      if (activeInputRef.current !== 'touch') return;
      resetDragState(true);
    };

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
    sheet.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true });

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
      sheet.removeEventListener('touchcancel', handleTouchCancel);
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
    };
  }, [finishDrag, resetDragState, sheetNode, startDrag, updateDrag]);

  // Reset state on unmount.
  useEffect(() => {
    return () => {
      resetDragState(false);
    };
  }, [resetDragState]);

  return {
    dragY,
    sheetRef: setSheetRef,
    dragHandleRef,
    isDragging,
    // Pointer handlers continuam para mouse/desktop. Touch devices usam os
    // listeners nativos acima para poder chamar preventDefault em touchmove.
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  };
}
