'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-dismiss hook pra bottom sheets, baseado no pattern do `vaul`
 * (https://github.com/emilkowalski/vaul/blob/main/src/index.tsx).
 *
 * **Versão anterior** (round 21 v1) tentou `addEventListener` nativo com
 * `passive: false` + `preventDefault` no `pointermove`. Em iOS Safari isso
 * é fragile: até Safari 26.2 (recente), preventDefault em pointer events
 * com listeners passivos coexistindo não funcionava de forma consistente.
 * Webkit blog: https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
 *
 * **Pattern vaul** (que funciona em iOS produção, 13k stars):
 * 1. React JSX handlers (passive default — sem `preventDefault`)
 * 2. `setPointerCapture` no element TARGET do pointerdown (não no sheet pai)
 * 3. Fallback iOS: `window.addEventListener('touchend', ...)` once — iOS
 *    não dispara mouseUp/pointerup depois de scroll, esse fallback reseta
 * 4. Detectar text-selection (`window.getSelection().toString()`) e abortar
 *    o drag se o user está realmente selecionando texto
 * 5. CSS: `touch-action: none` no element draggable
 * 6. Sem `preventDefault` — o navegador gerencia scroll, e a gente só
 *    atualiza transform via CSS
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

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

export function useSheetDrag({
  onDismiss,
  dismissThreshold = 0.6,
  sheetHeightPx,
  respectInteractiveTargets = true,
  respectInternalScroll = true,
}: UseSheetDragOptions) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
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

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isInteractive(e.target)) return;
    if (!isInScrollableAtTop(e.target)) return;

    // Abort if user is selecting text (vaul pattern §shouldDrag).
    const highlightedText = window.getSelection()?.toString();
    if (highlightedText && highlightedText.length > 0) return;

    dragStartY.current = e.clientY;
    draggingRef.current = false;
    isAllowedToDragRef.current = true;

    // CRÍTICO: setPointerCapture no TARGET (não no sheet pai). Sem isso,
    // se o pointer sai do target original durante drag, perdemos os
    // pointermove. iOS Safari precisa pra sustentar drag passando handle.
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* pode falhar se target não suporta — não crítico */
    }

    // iOS fallback (vaul §onPress line 273): iOS não dispara mouseUp depois
    // de scroll, então touchend no window é um failsafe pra resetar estado
    // mesmo se pointerup for "perdido" pelo sistema.
    if (isIOS()) {
      const resetOnTouchEnd = () => {
        isAllowedToDragRef.current = false;
      };
      window.addEventListener('touchend', resetOnTouchEnd, { once: true });
    }
  }, [isInteractive, isInScrollableAtTop]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    if (!isAllowedToDragRef.current) return;

    const delta = e.clientY - dragStartY.current;
    if (!draggingRef.current && Math.abs(delta) < DEAD_ZONE_PX) return;

    if (!draggingRef.current) {
      draggingRef.current = true;
      setIsDragging(true);
    }

    // Só drag pra baixo. NÃO chama preventDefault — deixa o navegador
    // gerenciar scroll/UI gestures. O `touch-action: none` no draggable
    // element é o que evita scroll competir.
    if (delta > 0) {
      setDragY(delta);
    } else {
      setDragY(0);
    }
  }, [setDragY]);

  const handlePointerEnd = useCallback(() => {
    if (dragStartY.current === null) return;

    const heightPx = sheetHeightPxRef.current() || 720;
    const currentDragY = dragYRef.current;
    if (currentDragY / heightPx >= dismissThreshold) {
      setDragY(heightPx);
      setTimeout(() => onDismissRef.current(), CLOSE_ANIMATION_MS);
    } else {
      setDragY(0);
    }

    dragStartY.current = null;
    draggingRef.current = false;
    setIsDragging(false);
  }, [dismissThreshold, setDragY]);

  // Reset state on unmount.
  useEffect(() => {
    return () => {
      dragStartY.current = null;
      draggingRef.current = false;
      isAllowedToDragRef.current = true;
      dragYRef.current = 0;
    };
  }, []);

  return {
    dragY,
    sheetRef,
    dragHandleRef,
    isDragging,
    // Handlers pro JSX. Caller spread `{...bind}` no element draggable.
    // Voltamos pra JSX handlers (vs native addEventListener) porque vaul
    // mostrou que isso é suficiente em iOS produção + evita complexidade.
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  };
}
