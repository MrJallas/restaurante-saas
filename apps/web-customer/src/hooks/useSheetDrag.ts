'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-dismiss hook pra bottom sheets em iOS Safari.
 *
 * **Por que não usar React's onPointer* JSX handlers:**
 * React 17/18 registra event listeners de touch/wheel/pointer como
 * **passive por default** (perf), o que faz `e.preventDefault()` falhar
 * SILENCIOSAMENTE. Em iOS Safari isso significa que o scroll nativo da
 * página vence o drag — a sheet "engasga". Bug conhecido:
 * https://github.com/facebook/react/issues/22794
 *
 * Plus: iOS Safari tem suporte limitado a `touch-action: pan-y` (só
 * `auto` e `manipulation` totalmente suportados), então depender só de
 * CSS não basta.
 *
 * **Solução** (padrão do vaul, react-spring-bottom-sheet): registrar
 * listeners NATIVOS via `addEventListener` com explicit `{ passive: false }`
 * num `useEffect`, attached ao element via ref. Aí `preventDefault`
 * realmente funciona, drag flui, scroll é cancelado quando necessário.
 *
 * **API:**
 * ```ts
 * const { dragY, sheetRef, dragHandleRef, isDragging } = useSheetDrag({
 *   onDismiss: () => closeSheet(),
 *   dismissThreshold: 0.6,        // 60% da altura → close
 *   sheetHeightPx: () => 720,     // pra calcular threshold
 * });
 * ```
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

export function useSheetDrag({
  onDismiss,
  dismissThreshold = 0.6,
  sheetHeightPx,
  respectInteractiveTargets = true,
  respectInternalScroll = true,
}: UseSheetDragOptions) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLDivElement | null>(null);

  // State pra trigger re-render + ref pra leitura sincronia dentro do
  // listener nativo (sem precisar re-registrar quando dragY muda).
  const [dragY, setDragYState] = useState(0);
  const dragYRef = useRef(0);
  const setDragY = useCallback((y: number) => {
    dragYRef.current = y;
    setDragYState(y);
  }, []);

  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef<number | null>(null);
  const draggingRef = useRef(false);

  // Manter refs estáveis pras opções — o handler nativo lê via ref pra
  // evitar re-bind quando callbacks mudam de identidade (gera jank).
  const onDismissRef = useRef(onDismiss);
  const sheetHeightPxRef = useRef(sheetHeightPx);
  onDismissRef.current = onDismiss;
  sheetHeightPxRef.current = sheetHeightPx;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!respectInteractiveTargets) return false;
      if (!(target instanceof HTMLElement)) return false;
      const handle = dragHandleRef.current;
      if (handle && handle.contains(target)) return false;
      return target.closest('button, a, input, textarea, select') !== null;
    };

    const isInScrollableAtTop = (target: EventTarget | null): boolean => {
      if (!respectInternalScroll) return true;
      if (!(target instanceof HTMLElement)) return true;
      const scrollEl = target.closest<HTMLElement>('[data-scroll-area="true"]');
      if (!scrollEl) return true;
      return scrollEl.scrollTop <= 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isInteractive(e.target)) return;
      if (!isInScrollableAtTop(e.target)) return;
      dragStartY.current = e.clientY;
      draggingRef.current = false;
      try {
        sheet.setPointerCapture?.(e.pointerId);
      } catch {
        /* setPointerCapture pode falhar — não crítico */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragStartY.current === null) return;
      const delta = e.clientY - dragStartY.current;
      if (!draggingRef.current && Math.abs(delta) < DEAD_ZONE_PX) return;
      if (!draggingRef.current) {
        draggingRef.current = true;
        setIsDragging(true);
      }
      if (delta > 0) {
        setDragY(delta);
        // CRÍTICO: preventDefault aqui PRECISA do listener passive:false
        // (registrado abaixo) pra funcionar em iOS Safari. Cancela scroll
        // vertical nativo que estaria competindo pelo gesto.
        if (e.cancelable) e.preventDefault();
      } else {
        setDragY(0);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (dragStartY.current === null) return;
      try {
        sheet.releasePointerCapture?.(e.pointerId);
      } catch {
        /* releasePointerCapture pode falhar — não crítico */
      }
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
    };

    // CRÍTICO: passive:false pra que preventDefault funcione em iOS Safari.
    // React JSX handlers são passive:true por default em React 17+.
    const opts: AddEventListenerOptions = { passive: false };

    sheet.addEventListener('pointerdown', onPointerDown, opts);
    sheet.addEventListener('pointermove', onPointerMove, opts);
    sheet.addEventListener('pointerup', onPointerEnd, opts);
    sheet.addEventListener('pointercancel', onPointerEnd, opts);

    return () => {
      sheet.removeEventListener('pointerdown', onPointerDown);
      sheet.removeEventListener('pointermove', onPointerMove);
      sheet.removeEventListener('pointerup', onPointerEnd);
      sheet.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [
    dismissThreshold,
    respectInteractiveTargets,
    respectInternalScroll,
    setDragY,
  ]);

  return {
    dragY,
    sheetRef,
    dragHandleRef,
    isDragging,
  };
}
