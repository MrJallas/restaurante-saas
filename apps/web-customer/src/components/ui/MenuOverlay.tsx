'use client';

/**
 * MenuOverlay — sheet bottom-up que renderiza o cardápio como overlay
 * sobre o Chat/Home, em vez de navegar pra rota dedicada `/[slug]/cardapio`
 * (canvas V20 §F05 line 216).
 *
 * Round 21 §A. Antes a tool `view_menu` da IA chamava `router.push(/cardapio)`,
 * o que perdia o contexto do chat (mensagens sumiam ao voltar). Agora a
 * tool abre essa sheet — o chat fica preservado por baixo e o cardápio
 * aparece em overlay arrastável.
 *
 * Estratégia: a sheet hospeda um `<iframe>` apontando pra
 * `/[slug]/cardapio?embed=1`. Mesmo origin → iframe compartilha
 * sessionStorage (session token, customerId), então pedidos funcionam.
 *
 * Drag via `useSheetDrag` — native addEventListener com passive:false.
 * React JSX onPointer* handlers são passive:true em React 17+ e
 * preventDefault não funciona em iOS Safari (bug conhecido). Hook
 * centraliza a lógica + scroll detection + threshold.
 */

import { useCallback, useEffect, useRef, type SyntheticEvent } from 'react';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { getDialogFocusableElements } from '../../lib/dialog-focus';

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  /**
   * Round 21 §G: quando view_menu tool da IA dispatcha com `category=…`,
   * propagamos a categoria pra abrir o /cardapio na aba certa. Iframe
   * recebe `?embed=1&category=<raw>` + `&tab=bebidas` quando o regex
   * de bebida bate. cardapio/page.tsx lê ambos pra setar tab inicial.
   */
  category?: string | null;
}

function isDrinkCategory(category?: string | null): boolean {
  if (!category) return false;
  return /bebida|drink|vinho|cerveja|suco|água|agua|refrigerante/i.test(category);
}

export function MenuOverlay({ open, onClose, slug, category }: MenuOverlayProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const detachFrameKeydownRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const sheetHeightFn = useCallback(() => {
    if (typeof window === 'undefined') return 720;
    // 88dvh é o canon V20 pra overlay "quase fullscreen" com backdrop visível.
    return Math.round(window.innerHeight * 0.88);
  }, []);

  // No MenuOverlay o body é iframe (opaco a pointer events do parent),
  // então o drag em si só funciona via dragHandle. `respectInternalScroll:
  // false` porque o iframe gerencia o próprio scroll. `bind` plugga
  // pointer handlers no element draggable (vaul pattern, React JSX).
  const { dragY, sheetRef, dragHandleRef, isDragging, bind } = useSheetDrag({
    onDismiss: onClose,
    sheetHeightPx: sheetHeightFn,
    respectInternalScroll: false,
  });

  // Body scroll lock centralizado (round 21 §H fix).
  useBodyScrollLock(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const setDialogSheetRef = useCallback(
    (node: HTMLDivElement | null) => {
      sheetRef(node);
      dialogRef.current = node;
    },
    [dialogRef, sheetRef],
  );

  // Keyboard events inside an iframe do not bubble to the parent document.
  // Bridge Escape and the Tab boundary so the modal remains closable/trapped.
  const handleFrameLoad = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    detachFrameKeydownRef.current?.();
    try {
      const frameDocument = event.currentTarget.contentDocument;
      if (!frameDocument) return;
      const onFrameKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          onCloseRef.current();
          return;
        }
        if (keyEvent.key !== 'Tab') return;
        const focusable = frameDocument.body ? getDialogFocusableElements(frameDocument.body) : [];
        const active = frameDocument.activeElement;
        const atBoundary =
          focusable.length === 0 ||
          (!keyEvent.shiftKey && active === focusable[focusable.length - 1]) ||
          (keyEvent.shiftKey && active === focusable[0]);
        if (atBoundary) {
          keyEvent.preventDefault();
          closeButtonRef.current?.focus({ preventScroll: true });
        }
      };
      frameDocument.addEventListener('keydown', onFrameKeyDown);
      detachFrameKeydownRef.current = () =>
        frameDocument.removeEventListener('keydown', onFrameKeyDown);
    } catch {
      // Same-origin is expected; fail safely if a deployment changes it.
    }
  }, []);

  useEffect(() => {
    return () => {
      detachFrameKeydownRef.current?.();
      detachFrameKeydownRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  // Embed URL — `?embed=1` faz o /cardapio renderizar sem AppShell.
  // Round 21 §G: quando view_menu(category=…) chega, propagamos `tab=bebidas`
  // se a categoria casa com bebidas + `category=<raw>` pra cardapio/page.tsx
  // selecionar a aba/categoria correta de cara.
  const embedParams = new URLSearchParams({ embed: '1' });
  if (isDrinkCategory(category)) embedParams.set('tab', 'bebidas');
  if (category) embedParams.set('category', category);
  const embedSrc = `/${slug}/cardapio?${embedParams.toString()}`;

  return (
    <div className="fixed inset-0 z-[60]" data-testid="menu-overlay">
      {/* Backdrop · ink/32 + tap fecha */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 z-0 bg-black/[0.32]" />

      {/* Sheet — pointer handlers via {...bind} (vaul pattern). O drag
          handle lá no topo é onde o user pega — o iframe ocupa o resto e
          captura pointer events dentro dele (não sobem pro parent). */}
      <div
        ref={setDialogSheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cardápio"
        tabIndex={-1}
        data-dialog-initial-focus
        className="absolute inset-x-0 bottom-0 z-10 flex h-[88dvh] flex-col rounded-t-[22px] border-[1.5px] border-b-0 border-ink bg-bg pb-safe shadow-[0_-8px_32px_rgba(0,0,0,0.10)] animate-slide-up-overlay select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          animation: dragY > 0 || isDragging ? 'none' : undefined,
          transition: isDragging ? undefined : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
        {...bind}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar cardápio"
          className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20 focus:flex focus:h-11 focus:w-11 focus:items-center focus:justify-center focus:rounded-full focus:border focus:border-ink focus:bg-bg focus:text-ink"
        >
          ×
        </button>
        {/* Drag handle — h-12 (48px) pra grab generoso. `touch-action: none`
            via `touch-none` impede scroll competir. */}
        <div
          ref={dragHandleRef}
          data-drag-handle="true"
          className="flex h-12 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="h-[5px] w-12 rounded-[3px] bg-border-soft opacity-70" />
        </div>

        {/* Iframe — content do cardápio. */}
        <iframe
          src={embedSrc}
          title="Cardápio"
          onLoad={handleFrameLoad}
          className="min-h-0 w-full flex-1 border-0 bg-bg"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
