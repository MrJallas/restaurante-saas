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
// Aligns with the `transition: transform 220ms` set inline by the consumers.
// 200ms had the timeout firing before the CSS transition could finish on
// slower iOS frames, which produced a brief mid-translate flash before unmount.
const CLOSE_ANIMATION_MS = 220;
// Added on top of the *measured* sheet height when sliding out, so the
// element clears the viewport even with safe-area padding (~34px on the
// iPhone home-bar models), the 1.5px border, and the bottom shadow stack.
// Without this buffer the sheet left a 100–200px sliver visible after a
// fast dismiss — the "split-state lâmina" reported by users.
const CLOSE_TRANSFORM_BUFFER_PX = 96;

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
  const closeTimerRef = useRef<number | null>(null);
  const closeFrameRef = useRef<number | null>(null);
  const dismissInProgressRef = useRef(false);

  // Keep options stable in refs so handlers don't re-bind unnecessarily.
  const onDismissRef = useRef(onDismiss);
  const sheetHeightPxRef = useRef(sheetHeightPx);
  onDismissRef.current = onDismiss;
  sheetHeightPxRef.current = sheetHeightPx;

  const isInteractive = useCallback(
    (target: EventTarget | null): boolean => {
      if (!respectInteractiveTargets) return false;
      if (!(target instanceof HTMLElement)) return false;
      const handle = dragHandleRef.current;
      if (handle && handle.contains(target)) return false;
      return target.closest('button, a, input, textarea, select') !== null;
    },
    [respectInteractiveTargets],
  );

  const isInScrollableAtTop = useCallback(
    (target: EventTarget | null): boolean => {
      if (!respectInternalScroll) return true;
      if (!(target instanceof HTMLElement)) return true;
      const scrollEl = target.closest<HTMLElement>('[data-scroll-area="true"]');
      if (!scrollEl) return true;
      return scrollEl.scrollTop <= 0;
    },
    [respectInternalScroll],
  );

  const resetDragState = useCallback(
    (resetPosition: boolean) => {
      dragStartY.current = null;
      draggingRef.current = false;
      isAllowedToDragRef.current = true;
      activeInputRef.current = null;
      activeTouchIdRef.current = null;
      setIsDragging(false);
      if (resetPosition) setDragY(0);
    },
    [setDragY],
  );

  const setSheetRef = useCallback(
    (node: HTMLDivElement | null) => {
      sheetRef.current = node;
      setSheetNode(node);
      if (node === null) {
        // The hook instance stays mounted while consumers render `null` for
        // `open=false`, so state must be reset when the sheet DOM leaves.
        resetDragState(true);
      }
    },
    [resetDragState],
  );

  const fireDismiss = useCallback(() => {
    closeTimerRef.current = null;
    if (!dismissInProgressRef.current) return;
    dismissInProgressRef.current = false;
    onDismissRef.current();
  }, []);

  const cancelScheduledDismiss = useCallback(() => {
    dismissInProgressRef.current = false;
    if (closeFrameRef.current !== null) {
      window.cancelAnimationFrame(closeFrameRef.current);
      closeFrameRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (dismissTarget: number) => {
      cancelScheduledDismiss();
      dismissInProgressRef.current = true;

      closeFrameRef.current = window.requestAnimationFrame(() => {
        closeFrameRef.current = null;
        setDragY(dismissTarget);
        closeTimerRef.current = window.setTimeout(fireDismiss, CLOSE_ANIMATION_MS);
      });
    },
    [cancelScheduledDismiss, fireDismiss, setDragY],
  );

  const canStartDrag = useCallback(
    (target: EventTarget | null): boolean => {
      if (isInteractive(target)) return false;
      if (!isInScrollableAtTop(target)) return false;

      // Abort if user is selecting text (vaul pattern §shouldDrag).
      const highlightedText = window.getSelection()?.toString();
      if (highlightedText && highlightedText.length > 0) return false;

      return true;
    },
    [isInteractive, isInScrollableAtTop],
  );

  const startDrag = useCallback(
    (clientY: number, target: EventTarget | null, input: 'pointer' | 'touch'): boolean => {
      if (dismissInProgressRef.current) return false;
      if (!canStartDrag(target)) return false;
      dragStartY.current = clientY;
      draggingRef.current = false;
      isAllowedToDragRef.current = true;
      activeInputRef.current = input;
      return true;
    },
    [canStartDrag],
  );

  const updateDrag = useCallback(
    (clientY: number, options: { allowUpwardScroll: boolean }): boolean => {
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
    },
    [resetDragState, setDragY],
  );

  const finishDrag = useCallback(() => {
    if (dragStartY.current === null) return;

    // Measure the ACTUAL rendered sheet height instead of trusting the
    // caller's estimate. The estimate is typically a fraction of
    // window.innerHeight (0.62 / 0.88), but the DOM element can be taller
    // — content flexes up to its max-h, and dvh-based caps diverge from
    // innerHeight when the iOS URL bar is showing. If we translate by the
    // estimate, the bottom of the sheet stays inside the viewport: the
    // "split-state lâmina" bug (backdrop fades, sheet stays as sliver).
    const measured = sheetRef.current?.offsetHeight ?? 0;
    const estimated = sheetHeightPxRef.current() || 0;
    // Threshold check uses the smaller value so we don't fire dismiss
    // prematurely on very tall sheets.
    const thresholdBasis = Math.min(measured || estimated, estimated || measured) || 720;
    // Slide-out target is the larger value + buffer so the element fully
    // clears the viewport before unmount.
    const dismissTarget = Math.max(measured, estimated, 720) + CLOSE_TRANSFORM_BUFFER_PX;

    const currentDragY = dragYRef.current;
    if (currentDragY / thresholdBasis >= dismissThreshold) {
      resetDragState(false);
      scheduleDismiss(dismissTarget);
    } else {
      cancelScheduledDismiss();
      setDragY(0);
      resetDragState(false);
    }
  }, [cancelScheduledDismiss, dismissThreshold, resetDragState, scheduleDismiss, setDragY]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch' && hasNativeTouchEvents()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!startDrag(e.clientY, e.target, 'pointer')) return;

      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* pode falhar se target não suporta — não crítico */
      }
    },
    [startDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeInputRef.current !== 'pointer') return;
      updateDrag(e.clientY, { allowUpwardScroll: false });
    },
    [updateDrag],
  );

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

  // Reset state on unmount. A drag-dismiss already in progress is allowed
  // to finish its external `onDismiss`, because that callback is what flips
  // the parent `open` state and releases the backdrop/body lock.
  useEffect(() => {
    return () => {
      if (dismissInProgressRef.current && closeFrameRef.current !== null) {
        window.cancelAnimationFrame(closeFrameRef.current);
        closeFrameRef.current = null;
        closeTimerRef.current = window.setTimeout(fireDismiss, CLOSE_ANIMATION_MS);
      }

      if (!dismissInProgressRef.current) {
        if (closeFrameRef.current !== null) {
          window.cancelAnimationFrame(closeFrameRef.current);
          closeFrameRef.current = null;
        }
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      }
      dragYRef.current = 0;
      resetDragState(false);
    };
  }, [fireDismiss, resetDragState]);

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
