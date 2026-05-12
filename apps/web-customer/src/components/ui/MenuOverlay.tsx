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

import { useCallback, useEffect } from 'react';
import { useSheetDrag } from '../../hooks/useSheetDrag';

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
  slug: string;
}

export function MenuOverlay({ open, onClose, slug }: MenuOverlayProps) {
  const sheetHeightFn = useCallback(() => {
    if (typeof window === 'undefined') return 720;
    // 88dvh é o canon V20 pra overlay "quase fullscreen" com backdrop visível.
    return Math.round(window.innerHeight * 0.88);
  }, []);

  // No MenuOverlay o body é iframe (opaco a pointer events do parent),
  // então o drag em si só funciona via dragHandle. respectInternalScroll
  // false porque o iframe gerencia o próprio scroll — não cabe ao parent
  // detectar "scrollado no topo".
  const { dragY, sheetRef, dragHandleRef, isDragging } = useSheetDrag({
    onDismiss: onClose,
    sheetHeightPx: sheetHeightFn,
    respectInternalScroll: false,
  });

  // Lock body scroll + Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Embed URL — `?embed=1` faz o /cardapio renderizar sem AppShell.
  const embedSrc = `/${slug}/cardapio?embed=1`;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Cardápio"
      data-testid="menu-overlay"
    >
      {/* Backdrop · ink/32 + tap fecha */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-black/[0.32]"
      />

      {/* Sheet — ref vai pro hook (drag pode acontecer no topo da sheet
          via handle; o iframe ocupa o resto). */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-10 flex h-[88dvh] flex-col rounded-t-[22px] border-[1.5px] border-b-0 border-ink bg-bg pb-safe shadow-[0_-8px_32px_rgba(0,0,0,0.10)] animate-slide-up-overlay select-none [-webkit-user-select:none] [-webkit-touch-callout:none]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: isDragging
            ? undefined
            : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — área tap target alta (h-12 pra dar grab generoso).
            ref vai pro hook (drag handle SEMPRE captura drag, mesmo sobre
            elemento interativo). */}
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
          className="min-h-0 w-full flex-1 border-0 bg-bg"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
