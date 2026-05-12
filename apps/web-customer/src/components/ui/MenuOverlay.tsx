'use client';

/**
 * MenuOverlay — sheet bottom-up que renderiza o cardápio como overlay
 * sobre o Chat/Home, em vez de navegar pra rota dedicada `/[slug]/cardapio`
 * (canvas V20 §F05 line 216).
 *
 * Round 21 §A. Antes a tool `view_menu` da IA chamava `router.push(/cardapio)`,
 * o que perdia o contexto do chat (mensagens sumiam ao voltar) e quebrava
 * a UX "conversa contínua" do V20. Agora a tool abre essa sheet — o chat
 * fica preservado por baixo (blurred) e o cardápio aparece em overlay
 * arrastável.
 *
 * Estratégia: a sheet hospeda um `<iframe>` apontando pra
 * `/[slug]/cardapio?embed=1`. O param `embed` faz a rota cardápio
 * renderizar sem AppShell (header + drawer), economizando refator do
 * `cardapio/page.tsx`. Mesmo origin → iframe compartilha sessionStorage
 * (session token, customerId), então os pedidos funcionam idênticos.
 *
 * Drag-to-dismiss segue o mesmo padrão do CallWaiterSheet (pointer events
 * + touch-action: pan-y + user-select: none pra evitar text selection no
 * iOS). Threshold 60% do altura — drag passa disso → dispatch close.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
  slug: string;
}

const DISMISS_THRESHOLD = 0.6;

export function MenuOverlay({ open, onClose, slug }: MenuOverlayProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Drag state — translateY abaixo do estado idle. Mesmo pattern do
  // CallWaiterSheet pra consistência (pointer events cobrem mouse, touch,
  // pencil num único path).
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const draggingRef = useRef(false);

  // Reset state on reopen
  useEffect(() => {
    if (!open) return;
    setDragY(0);
  }, [open]);

  // Lock body scroll. Esc fecha. Padrão idêntico ao CallWaiterSheet.
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

  const sheetHeightPx = useMemo(() => {
    if (typeof window === 'undefined') return 720;
    // 88dvh é o canon do V20 pra overlays "tela cheia menos backdrop visível
    // no topo". Cardápio precisa de espaço pra browsing — mais alto que
    // CallWaiterSheet (que é 62dvh com 5 motivos curtos).
    return Math.round(window.innerHeight * 0.88);
  }, [open]);

  // Pointer drag — captura apenas no drag handle (top 36px) pra evitar
  // engolir clicks dentro do iframe. Diferente do CallWaiterSheet (onde
  // drag funcionava em qualquer área fora de buttons), aqui o iframe é
  // opaco ao pointer events do parent — então o drag tem que vir do
  // handle visual.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStart.current = e.clientY;
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    const delta = e.clientY - dragStart.current;
    if (!draggingRef.current && Math.abs(delta) < 4) return;
    draggingRef.current = true;
    if (delta > 0) {
      setDragY(delta);
      if (e.cancelable) e.preventDefault();
    } else {
      setDragY(0);
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (dragY / sheetHeightPx >= DISMISS_THRESHOLD) {
      setDragY(sheetHeightPx);
      setTimeout(onClose, 200);
    } else {
      setDragY(0);
    }
    dragStart.current = null;
    draggingRef.current = false;
  };

  if (!open) return null;

  // Embed URL — `?embed=1` faz o /cardapio renderizar sem AppShell
  // (sem header/drawer/topo). O iframe herda sessionStorage + cookies do
  // parent (mesmo origin), então session token + customerId funcionam.
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

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-10 flex h-[88dvh] flex-col rounded-t-[22px] border-[1.5px] border-b-0 border-ink bg-bg pb-safe shadow-[0_-8px_32px_rgba(0,0,0,0.10)] animate-slide-up-overlay"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition:
            dragStart.current === null
              ? 'transform 220ms cubic-bezier(.2,.8,.2,1)'
              : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — área tap target alta (h-9) cobrindo o pill visual
            de 40×4. iOS pointer-capture funciona aqui sem engolir clicks no
            iframe abaixo. select-none + touch-callout-none previnem iOS
            text-selection callout interromper o drag. */}
        <div
          data-drag-handle="true"
          className="flex h-9 w-full shrink-0 cursor-grab select-none touch-none items-center justify-center active:cursor-grabbing [-webkit-user-select:none] [-webkit-touch-callout:none]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="h-[4px] w-10 rounded-[3px] bg-border-soft opacity-60" />
        </div>

        {/* Iframe — content do cardápio. Sandbox `allow-same-origin`
            + `allow-scripts` + `allow-forms` cobrem o necessário (apiPost,
            sessionStorage). Não precisa `allow-top-navigation` porque os
            cliques em items navegam DENTRO do iframe (também sem AppShell). */}
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
